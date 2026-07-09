/**
 * 技能执行工具模�?
 *
 * 模块职责�?
 * - 根据搜索结果创建�?Agent 并执行特定技�?
 * - �?Agent 加载指定的技能列表进行执�?
 * - 支持多步操作，复用子 Agent 实例，保持对话状�?
 * - 执行完成后返回结果给�?Agent
 * - 支持流式返回每一步工具调用结�?
 * - 流式推送子 Agent �?AI 文本到前端作�?think 块展�?
 *
 * 设计说明�?
 * - 接收技�?ID 列表和用户输�?
 * - 创建�?Agent 实例并缓存，支持多步复用
 * - 使用流式执行�?Agent，实时返回每步结�?
 * - 返回格式化的执行结果给主 Agent
 * - 缓存的子 Agent 有过期时间，自动清理
 *
 * Think 块机制：
 * - �?Agent 开始执行时发射 think_start 事件，前端创建可折叠�?think 区域
 * - �?Agent �?AI 文本通过 agent_text 事件流式推送到 think 块中
 * - �?Agent 完成时发�?think_end 事件，前端标�?think 块完成并可折�?
 *
 * @module ExecuteSkill
 * @author Agent Core Team
 * @since 1.0.0
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { AgentFactory } from "../agent/agent";
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { buildStaticSystemPrompt } from "../prompts";
import { unwrapLangGraphStreamPayload } from "../controller/agent.controller";
import axios from "axios";
import * as crypto from 'crypto';
import {
  emitToolTraceEvent,
  emitThinkStartEvent,
  consumeInvocationId,
  getActiveParentToolId,
  emitAgentTextEvent,
  emitThinkEndEvent,
  getActiveThinkId,
  setActiveThinkId,
  clearActiveThinkId,
  pushInvocationId,
  sanitizeToolTraceArguments,
  sanitizeToolResultForTrace,
  type ToolTraceStatus,
} from "./tool-trace-context";
import { describeGatewayExtendedTool } from "./java-skills";
import { interrupt, isGraphInterrupt, INTERRUPT } from "@langchain/langgraph";

/**
 * �?payload 中提取中断条�?
 */
function asArray2<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getMessagesFromPayload(payload: any): any[] {
  if (!payload || typeof payload !== 'object') return [];
  return [
    ...asArray2(payload.agent?.messages),
    ...asArray2(payload.tools?.messages),
    ...asArray2(payload.messages),
  ];
}

function extractInterruptEntries(payload: unknown): Array<{ value?: unknown }> {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const arr = p[INTERRUPT] ?? p.__interrupt__;
  return Array.isArray(arr) ? arr : [];
}

const executeSkillInputSchema = z.object({
  userInput: z
    .string()
    .min(1)
    .describe("The detailed task description for the sub-agent to execute. " +
      "This includes specific instructions, file IDs, and complete workflow steps. " +
      "For multi-step tasks, describe the FULL workflow so the sub-agent can plan the execution order internally. " +
      "IMPORTANT: When the task is about operating on a file, you MUST include the concrete file id(s) in this text " +
      "(e.g. \"�?fileId=12 �?Excel 做汇总\"), extracting the file id mainly from prior tool results or conversation context."),
  searchQuery: z
    .string()
    .optional()
    .describe("The search query for vector similarity skill matching. " +
      "This should be a concise extraction of the operations needed (e.g., 'Excel统计 Word生成' or '文件读取 数据分析'). " +
      "If not provided, the userInput will be used for vector search."),
  // add-skill-tags-and-intent-filtering（路�?B：主 LLM 自报 tags，不再走独立 LLM 意图识别�?
  // 由主 LLM 一次性输出，无需额外 round-trip；可选字段，不确定时省略�?
  tags: z
    .array(z.string())
    .max(3)
    .optional()
    .describe("OPTIONAL: 1-3 tags from the whitelist below to help narrow skill matching. " +
      "Omit this field entirely if unsure �?the system will fall back to vector-only search. " +
      "Tag whitelist (15 total, must match exactly; mirrors FileToolSeeder.TOOL_TAGS): " +
      "file_type [通用, Word, 文本, Markdown, Excel]; " +
      "operation_intent [读取查看, 编辑修改, 创建写入, 分析计算]; " +
      "business_scenario [文件管理, 检索查�? 生成导出, 提取解析, 编辑整理, 计算分析]. " +
      "Any tag NOT in this whitelist is silently dropped. " +
      "Examples: '在文件末尾追加一�? �?tags=['创建写入']; " +
      "'删除文件' �?tags=['编辑修改','文件管理']; " +
      "'统计 Excel 销�? �?tags=['分析计算','计算分析']; " +
      "'Word 文档替换文字' → tags=['编辑修改','编辑整理']."),
  continueConversation: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to continue the previous conversation with the same sub-agent. " +
      "Use this when you need multiple rounds with the SAME skill set. " +
      "When false (default), a new sub-agent is created with freshly matched skills."),
});

interface CachedSubAgent {
  agent: any;
  messages: BaseMessage[];
  createdAt: number;
  skillIds: number[];
}

const subAgentCache = new Map<string, CachedSubAgent>();
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

function getCacheKey(skillIds: number[], userId?: string): string {
  return `${userId || 'default'}_${skillIds.sort().join('_')}`;
}

function cleanupExpiredAgents(): void {
  const now = Date.now();
  for (const [key, cached] of subAgentCache.entries()) {
    if (now - cached.createdAt > CACHE_EXPIRATION_MS) {
      subAgentCache.delete(key);
    }
  }
}

setInterval(cleanupExpiredAgents, 60 * 1000);

/**
 * Gateway 技能匹配返回的单项结构�?
 */
interface SkillMatchItem {
  skillId: number;
  name: string;
  description: string;
  score: number;
}

/**
 * add-skill-tags-and-intent-filtering�?3 标签白名单�?
 * �?FileToolSeeder.TOOL_TAGS 同步；任何分歧在 PR review 阶段拒绝合入�?
 * 5 + 12 + 6 = 23
 * add-skill-tags-and-intent-filtering：15 标签白名单（与 FileToolSeeder.TOOL_TAGS 镜像）。
 * 任何分歧在 PR review 阶段拒绝合入。
 * file_type(5) + operation_intent(4) + business_scenario(6) = 15。
 *
 * operation_intent 由 12 个细粒度动作合并为 4 个复合动作：
 *   - 读取查看 := 读取 / 搜索 / 提取 / 展示
 *   - 编辑修改 := 修改 / 编辑 / 转换 / 删除 / 复制
 *   - 创建写入 := 写入 / 生成 / 新建
 *   - 分析计算 := 分析 / 校验
 *
 * 部分工具的 operationIntent 是多值（如 "编辑修改、创建写入"），由 FileToolSeeder.joinOperationIntent
 * 用 "," 分隔写入 DB，SkillMapper.findIdsByTags 用 FIND_IN_SET 命中任一。
 */
const INTENT_TAG_WHITELIST: ReadonlySet<string> = new Set<string>([
  // file_type (5)
  "通用", "Word", "文本", "Markdown", "Excel",
  // operation_intent (4 复合)
  "读取查看", "编辑修改", "创建写入", "分析计算",
  // business_scenario (6)
  "文件管理", "检索查询", "生成导出", "提取解析", "编辑整理", "计算分析",
]);

/**
 * 调用 Gateway 向量检�?API 自动匹配技能�?
 * @param query 用户任务文本，作为检索查�?
 * @param tags 可选标签（add-skill-tags-and-intent-filtering：传入时 gateway 先按 tag 硬筛�?
 * @param gatewayUrl Gateway 基础 URL
 * @param apiToken X-API-Key 令牌
 * @returns 匹配的技能列表；失败时返回空数组
 */
/**
 * 基础工具缓存——在服务生命周期内只查一�?Gateway
 */
let cachedUtilitySkills: SkillMatchItem[] | null = null;
let utilityFetchPromise: Promise<SkillMatchItem[]> | null = null;

/**
 * 获取基础工具技能（file_list, file_read, file_write�?
 *
 * 这些是子 Agent 的基础能力，不管任务是什么都得有——就�?ls、cat �?write�?
 * 不走向量检索，直接用数据库查询�?api/skills/by-names），�?embedding API 延迟�?
 * 在服务启动后首次调用时从 Gateway 拉取，之后全局缓存�?
 */
async function getUtilitySkills(gatewayUrl: string, apiToken: string): Promise<SkillMatchItem[]> {
  if (cachedUtilitySkills !== null) return cachedUtilitySkills;
  if (utilityFetchPromise) return utilityFetchPromise;

  utilityFetchPromise = (async () => {
    try {
      const { data } = await axios.get(
        `${gatewayUrl}/api/skills/by-names`,
        {
          params: { names: 'file_list,file_read,file_write', ownerType: 2 },
          headers: { 'X-API-Key': apiToken },
        },
      );
      const matches = (data?.matches || []) as SkillMatchItem[];
      console.log(`[autoSearchSkills] Utility skills loaded from DB: ${matches.map((m) => m.name).join(', ')}`);
      cachedUtilitySkills = matches;
      return matches;
    } catch (e: any) {
      console.error('[autoSearchSkills] Failed to fetch utility skills:', e?.message);
      return [];
    } finally {
      utilityFetchPromise = null;
    }
  })();

  return utilityFetchPromise;
}

/**
 * 自动技能匹�?+ 基础工具注入
 *
 * 每个�?Agent 都自动获�?file_list + file_read + file_write 作为基础能力（相当于 ls + cat + write），
 * 直接从数据库查询，不依赖向量搜索。领域技能（Excel/Word/SSH 等）由向量搜索匹配�?
 *
 * add-skill-tags-and-intent-filtering�?
 * - `tags` 非空时，gateway 会先�?file_type/operation_intent/business_scenario SQL 硬筛�?
 *   再做向量召回。基础工具不走 tags 路径�?
 * - `tags` �?null/undefined 时保持纯向量检索行为�?
 */
async function autoSearchSkills(
  query: string,
  tags: string[] | null,
  gatewayUrl: string,
  apiToken: string,
): Promise<SkillMatchItem[]> {
  try {
    // 并行：业务技能搜索（�?tags + excludeNames�? 基础工具数据库查�?
    const businessBody: { query: string; limit: number; tags?: string[]; excludeNames?: string[] } = {
      query,
      limit: 7,
      excludeNames: ['file_list', 'file_read', 'file_write'],
    };
    if (tags && tags.length > 0) {
      businessBody.tags = tags;
    }
    const [{ data }, utilitySkills] = await Promise.all([
      axios.post(
        `${gatewayUrl}/api/skills/match`,
        businessBody,
        { headers: { 'X-API-Key': apiToken, 'Content-Type': 'application/json' } },
      ),
      getUtilitySkills(gatewayUrl, apiToken),
    ]);

    let matches = (data?.matches || []) as SkillMatchItem[];

    if (matches.length === 0 && utilitySkills.length === 0) return [];

    // 合并基础工具（去重追加，确保不会和业务技能重复）
    const seenIds = new Set(matches.map((m) => m.skillId));
    for (const m of utilitySkills) {
      if (!seenIds.has(m.skillId)) {
        // utility 是兜底工具，不参与排序；score=0 把它们压到列表底部让�?LLM 不混�?
        matches.push({ skillId: m.skillId, name: m.name, description: m.description, score: 0 });
        seenIds.add(m.skillId);
      }
    }

    if (utilitySkills.length > 0) {
      console.log(`[autoSearchSkills] Total skills: ${matches.length} (${matches.length - utilitySkills.length} matched + ${utilitySkills.length} utility)${tags ? `, tags=${tags.join(',')}` : ''}`);
    } else if (tags) {
      console.log(`[autoSearchSkills] tags=${tags.join(',')}, matched ${matches.length} skills`);
    }

    return matches;
  } catch (error: any) {
    console.error('[autoSearchSkills] Gateway match failed:', error?.message);
    return [];
  }
}

/**
 * 技能执行工具（内置名：`execute_skill_with_context`�?
 *
 * 根据指定的技�?ID 列表创建�?Agent，并执行用户任务�?
 * �?Agent 支持多步操作，会自动缓存和复用，保持对话状态�?
 * 支持流式返回每一步工具调用结果�?
 *
 * Think 块：�?Agent 执行期间，AI 文本通过 agent_text 事件流式推送到前端 think 块中展示�?
 */
export class ExecuteSkillWithContextTool extends DynamicStructuredTool<typeof executeSkillInputSchema> {
  constructor(
    private readonly gatewayUrl: string,
    private readonly apiToken: string,
    private readonly openAiApiKey: string,
    private readonly llmConfig?: { modelName?: string; baseUrl?: string },
    private readonly userId?: string,
    /**
     * open spec: conversation-file-isolation
     * 当前对话�?conversationId，必须传给子 Agent，否则子 Agent �?file tool �?
     * gateway 拿不�?X-Conversation-Id header，导�?enabled_files / conversationId
     * 隔离完全失效�?
     */
    private readonly conversationId?: string,
  ) {
    super({
      name: "execute_skill_with_context",
      description:
        "Auto-match skills via vector search, create sub-agent, and execute. " +
        "PLANNING: 1) GROUP BY SKILL DOMAIN �?split complex tasks into domain-specific calls. " +
        "Each call should target at most 2 types of operations (e.g., 'Excel统计 数据筛�?, 'Word生成'). " +
        "When task involves �? operation types (e.g., Excel+Word+SSH), call separately per domain. " +
        "2) SAME DOMAIN MULTI-STEP: sub-agent handles multi-step operations within the same skill domain internally. " +
        "3) FILE PREREQUISITE: sub-agent reads files before operating. " +
        "4) RETRY on mismatch: rephrase userInput and call again. " +
        "The system will auto-search for matching skills via vector similarity based on userInput/searchQuery �?" +
        "this is the only supported approach. " +
        "Use continueConversation=true to continue a previous sub-agent conversation for multi-step operations. " +
        "IMPORTANT: When the task involves operating on a file (read/edit/parse/convert/aggregate/download " +
        "a document, Excel, Word, etc.), you MUST include the concrete file id(s) in the userInput " +
        "(e.g. \"�?fileId=12 �?Excel 做汇总\"), extracting the file id mainly from prior tool results " +
        "or the conversation context. Do NOT describe the file only by name �?the sub-agent cannot reliably " +
        "resolve which file without an id. Only omit the file id if no file id can be extracted from tool " +
        "results or the conversation context; in that case explicitly state that the file id is unknown.",
      schema: executeSkillInputSchema,
      func: async (args) => {
        // 每次调用生成唯一 ID，确保并行子 Agent 各自独立 think �?+ tool trace
        const invocationId = consumeInvocationId('execute_skill_with_context')
          || getActiveParentToolId('execute_skill_with_context')
          || crypto.randomUUID();
        // 推入 FIFO 队列，供控制器消费后替换 tool_status �?toolId�?
        // 使前端原�?execute_skill_with_context 节点�?ID 与子 Agent 工具 parentToolId 一�?
        // invocationId 已通过 consumeInvocationId 从控制器 push 的队列中获取

        // 立即 emit tool_status 建立父节点，确保�?Agent 工具 trace 到达时前端能�?ID 找到父节�?
        // （子 Agent 工具 trace �?func 内部通过 SSE 直接发出，比控制器处�?stream 更快到达前端�?
        emitToolTraceEvent({
          type: 'tool_status',
          toolId: invocationId,
          toolName: 'execute_skill_with_context',
          displayName: '子Agent 执行',
          kind: 'skill',
          status: 'running',
        });

        // thinkId / thinkStarted 声明�?try 外部，供 catch 块引�?
        let thinkId = '';
        let thinkStarted = false;
        let resolvedSkillIds: number[] = []; // �?try 外部声明，供 catch 块使�?
        try {
          const { userInput, searchQuery, continueConversation } = args;

          // ===== add-skill-tags-and-intent-filtering（路�?B：主 LLM 自报 tags�?====
          // 不再调用独立 LLM 意图识别（已废，详见 design.md D5）。主 LLM �?tool call �?
          // 可选地输出 tags（白名单 23 个）。未提供/不确�?�?�?e2ac8ce 全量向量池�?
          // 过滤白名�?+ 去重 + 截断�?3�?
          const rawTags: string[] | undefined = Array.isArray(args.tags) ? args.tags : undefined;
          let tags: string[] | null = null;
          if (rawTags && rawTags.length > 0) {
            const seen = new Set<string>();
            const filtered: string[] = [];
            for (const t of rawTags) {
              if (typeof t !== "string") continue;
              const tag = t.trim();
              if (!tag || !INTENT_TAG_WHITELIST.has(tag) || seen.has(tag)) continue;
              seen.add(tag);
              filtered.push(tag);
              if (filtered.length >= 3) break;
            }
            if (filtered.length > 0) tags = filtered;
          }
          // 诊断 log：分�?完全没传"/"传了但被过滤"两种情况
          if (tags) {
            console.log(`[TagsFromLLM] raw=${JSON.stringify(rawTags)} �?tags=[${tags.join(', ')}] (whitelist passed)`);
          } else if (rawTags && rawTags.length > 0) {
            console.log(`[TagsFromLLM] raw=${JSON.stringify(rawTags)} �?tags=null (all out-of-whitelist, fallback to e2ac8ce)`);
          } else {
            console.log(`[TagsFromLLM] raw=undefined (main LLM did NOT pass tags field, fallback to e2ac8ce)`);
          }

          // ===== 向量搜索模式：通过 Gateway 自动匹配技�?=====
          // 使用 searchQuery 进行向量检索，如果没有提供则使�?userInput
          const queryForSearch = searchQuery || userInput;
          const matchResult = await autoSearchSkills(queryForSearch, tags, gatewayUrl, apiToken);
          if (matchResult.length === 0) {
            // 无匹配技能：返回话术让主 Agent 告知用户
            return JSON.stringify({
              status: "NO_MATCH",
              message: `无法找到匹配"${queryForSearch}"的系统技能。请尝试：\n` +
                "1. 用更具体的关键词重新描述任务（如 Excel数据汇总、MySQL数据库查询、SSH服务器执�?等）\n" +
                "2. 确认管理员已启用相关系统技能（skill_owner_type=2 �?enabled=true）\n" +
                "3. 若技能未配置向量检索权重（search_weight=0），将不参与自动匹配",
            });
          }
          resolvedSkillIds = matchResult.map((m) => m.skillId);
          const matchedSkillNames = matchResult.map((m) => `${m.name || 'skill_' + m.skillId}(${(m.score || 0).toFixed(2)})`);
          console.log(`[SkillMatch] Matched ${matchedSkillNames.length} skills: ${matchedSkillNames.join(', ')}`);

          const cacheKey = getCacheKey(resolvedSkillIds, userId);

          let agent: any;
          let messages: BaseMessage[];

          const messagesRef: { messages: BaseMessage[] } = { messages: [] };

          if (continueConversation && subAgentCache.has(cacheKey)) {
            const cached = subAgentCache.get(cacheKey)!;
            agent = cached.agent;
            messagesRef.messages = [...cached.messages];
            messagesRef.messages.push(new HumanMessage(userInput));
          } else {
            const { agent: newAgent } = await AgentFactory.createSubAgent(
              gatewayUrl,
              apiToken,
              openAiApiKey,
              resolvedSkillIds,
              {
                modelName: llmConfig?.modelName || "gpt-4",
                baseUrl: llmConfig?.baseUrl,
                // open spec: conversation-file-isolation �?�?conversationId 透传给子 Agent�?
                // �?Agent �?file tool 时会作为 X-Conversation-Id 传给 gateway�?
                // 否则�?Agent 调出来的临时文件 conversationId 都是 NULL
                conversationId: this.conversationId,
              },
              userId
            );
            agent = newAgent;
            // �?Agent 负责调用工具完成操作，描述每步执行结果，但不做总结
            // 所有总结和概括由�?Agent 统一完成
            const subAgentSystemInstruction =
              "【执行规范】\n" +
              "�?你是一个执行者，只负责调用当前加载的工具来完成任务，不负责任务规划。\n" +
              "�?你可以执行多步操作来完成任务——不需要主 Agent 逐步指挥你。\n" +
              "�?每步工具调用完成后，简要描述操作和结果。\n" +
              "�?不要做总结推测——所有总结由主 Agent 负责。\n" +
              "�?工具返回的详细数据由�?Agent 呈现，你无需重复大段数据。\n\n" +
              "【防循环——MUST COMPLY】\n" +
              "�?计划一次，立即执行。不要重复规划同一件事。\n" +
              "�?如果你发现自己重复同一句话超过 2 次，立即调用工具而不是继续写重复内容。\n" +
              "�?需要创建大量数据（�?Excel 多行写入）时，一次性构造完整的工具调用参数，不要犹豫。\n" +
              "�?相信你的工具列表——如果你需要的能力在工具列表中，直接调用就好。\n\n" +
              "【文件操作——MUST READ FIRST】\n" +
              "�?对文件做任何操作之前，必须先�?file_list/file_read 读取文件，了解其结构和内容。\n" +
              "�?优先使用 userInput 中已给出�?fileId。若未给出，�?file_list 列出可用文件查找。\n" +
              "�?多步操作中的文件 ID 传递：上一步返回的 fileId（如临时文件）就是下一步的输入。\n" +
              "�?工具返回中的 fileId/downloadUrl/fileRef 字段包含最新文件标识，从中提取。\n" +
              "�?临时文件命名模式�?原文件名_temp_v1.xlsx'�?原文件名_temp_v2.xlsx'，注意用最新版本。\n\n" +
              "【工具限制——MUST COMPLY】\n" +
              "�?�?你绝对没�?execute_skill_with_context 工具，也没有任何技能搜�?发现能力。\n" +
              "�?�?你不能调�?execute_skill_with_context，这是主 Agent 的专属工具。\n" +
              "�?�?你不能尝试创建子 Agent 或调用任何代理工具。\n" +
              "�?�?你只能使用当前已加载的工具列表来完成任务。\n" +
              "�?如果当前加载的工具无法完成操作，返回 'TOOL_NOT_FOUND: 需要[具体能力描述]' 给主 Agent。\n" +
              "�?不要尝试调用任何你工具列表中没有的工具——这会导致执行失败。\n\n";
            const baseSystemPrompt = buildStaticSystemPrompt();
            messagesRef.messages = [
              new SystemMessage(subAgentSystemInstruction + baseSystemPrompt),
              new HumanMessage(userInput),
            ];
            messages = messagesRef.messages;
            subAgentCache.set(cacheKey, {
              agent,
              messages: messagesRef.messages,
              createdAt: Date.now(),
              skillIds: resolvedSkillIds,
            });
          }

          const toolCalls: Array<{
            toolName: string;
            input: any;
            output: string;
            timestamp: string;
            toolId?: string;
          }> = [];

          let output = "";
          let lastPayload: any = null;

          // 获取�?Agent �?execute_skill_with_context 父工具调用的 ID�?
          // 使子 Agent 的工具调用作为该父调用的子项显示
          const stream = await agent.stream(
            { messages },
            { streamMode: ["updates", "messages"] as any, recursionLimit: 25 },
          );
          const iterator = stream[Symbol.asyncIterator]();

          // Think 块：每次调用有独�?toolTraceId，并行子 Agent 互不覆盖
          const existingThinkId = getActiveThinkId(invocationId);
          if (existingThinkId) {
            thinkId = existingThinkId;
            thinkStarted = true; // 恢复场景，不重复发射 think_start
            console.log(`[ThinkBlock] Reusing thinkId=${thinkId} for invocationId=${invocationId} (resume)`);
          } else {
            thinkId = `think_${invocationId.slice(0, 8)}_${Date.now()}`;
            thinkStarted = false;
          }
          let subAgentTextAccum = '';

          // 仅在首次（非恢复）发�?think_start 事件
          if (!thinkStarted) {
            console.log(`[ThinkBlock] Emitting think_start: thinkId=${thinkId}, invocationId=${invocationId}`);
            emitThinkStartEvent({
              type: 'think_start',
              thinkId,
              parentToolId: invocationId,
              parentToolName: 'execute_skill_with_context',
              displayName: '子Agent 执行过程',
            });
            thinkStarted = true;
            setActiveThinkId(invocationId, thinkId);
          }

          while (true) {
            let raw: any;
            try {
              const result = await iterator.next();
              if (result.done) break;
              raw = result.value;
            } catch (error) {
              if (isGraphInterrupt(error) || (error && typeof error === 'object' && '__interrupt__' in error)) {
                throw error;
              }
              throw error;
            }

            // 区分 stream mode：["messages"] �?token 级增量，["nodeName"] �?updates
            const isMessagesMode = Array.isArray(raw) && raw.length >= 2 && raw[0] === 'messages';

            if (isMessagesMode) {
              // ── messages 模式：token 级流式文�?──
              const chunks = raw[1];
              const chunkArray = Array.isArray(chunks) ? chunks : [chunks];
              for (const chunk of chunkArray) {
                const cType = chunk._getType?.() ?? chunk.type ?? '';
                if (cType !== 'ai' && cType !== 'AIMessageChunk' && !String(chunk.constructor?.name ?? '').includes('AIMessage')) continue;

                // 提取 delta：支�?string 和数组格�?
                let delta = '';
                if (typeof chunk.content === 'string') {
                  delta = chunk.content;
                } else if (Array.isArray(chunk.content)) {
                  delta = chunk.content.map((p: any) => typeof p === 'string' ? p : p?.text ?? '').join('');
                }
                if (!delta) continue;

                subAgentTextAccum += delta;
                console.log(`[ThinkBlock] Token delta: thinkId=${thinkId}, delta_len=${delta.length}, accum=${subAgentTextAccum.length}`);
                emitAgentTextEvent({
                  type: 'agent_text',
                  thinkId,
                  role: 'sub_agent',
                  content: subAgentTextAccum,
                  replace: true,
                });
              }
              continue;
            }

            // ── updates 模式：完整消息（工具调用 / 工具结果 / 中断 / 文本）──
            const payload = unwrapLangGraphStreamPayload(raw);
            lastPayload = payload;

            // 检测子 Agent 发送的中断信号
            const interruptEntries = extractInterruptEntries(payload);
            if (interruptEntries.length > 0) {
              const interruptData = interruptEntries[0]?.value;
              if (interruptData && typeof interruptData === 'object') {
                const pendingInterruptToolCallId = (interruptData as any).toolCallId;
                if (pendingInterruptToolCallId && typeof pendingInterruptToolCallId === 'string') {
                  const toolName = (interruptData as any).toolName;
                  if (toolName) {
                    const pendingCall = toolCalls.find(tc => tc.toolName === toolName && tc.output === "");
                    if (pendingCall) {
                      pendingCall.toolId = pendingInterruptToolCallId;
                    }
                  }
                }
                throw interrupt({
                  kind: (interruptData as any).kind || 'extended_skill_confirmation',
                  toolName: `subagent_${(interruptData as any).toolName || 'unknown'}`,
                  toolCallId: (interruptData as any).toolCallId || `subagent_${Date.now()}`,
                  skillName: (interruptData as any).skillName || 'unknown',
                  skillId: (interruptData as any).skillId,
                  summary: (interruptData as any).summary || 'Sub-agent skill execution',
                  details: (interruptData as any).details || '',
                  parametersPreview: (interruptData as any).parametersPreview,
                  gatewayRequestId: (interruptData as any).gatewayRequestId || '',
                });
              }
            }

            // �?updates 模式 payload 中提取消息（兼容 {agent:{messages:[]}} / {tools:{messages:[]}} / {messages:[]} 三种结构�?
            const streamMessages: any[] = [
              ...asArray2((payload as any)?.agent?.messages),
              ...asArray2((payload as any)?.tools?.messages),
              ...asArray2((payload as any)?.messages),
            ];
            console.log(`[ThinkBlock] Sub-agent updates chunk: msgs=${streamMessages.length}, keys=${payload ? Object.keys(payload).join(',') : 'null'}`);

            for (const msg of streamMessages) {
              const type = msg._getType?.() ?? (msg as any).type ?? "";
              console.log(`[ThinkBlock] Sub-agent msg type=${type}, toolCalls=${(msg as any).tool_calls?.length || 0}, contentLen=${typeof msg.content === 'string' ? msg.content.length : 'non-string'}`);

              messagesRef.messages.push(msg);

              if (type === "ai" || type === "AIMessageChunk") {
                const calls = (msg as any).tool_calls ?? [];
                for (const call of calls) {
                  const toolId: string =
                    typeof (call as any).id === 'string' ? (call as any).id
                    : `${call.name}:${Date.now()}`;
                  toolCalls.push({
                    toolName: call.name,
                    input: call.args,
                    output: "",
                    timestamp: new Date().toISOString(),
                    toolId,
                  });

                  const gatewayInfo = describeGatewayExtendedTool(call.name);
                  emitToolTraceEvent({
                    type: 'tool_status',
                    toolId,
                    toolName: call.name,
                    displayName: gatewayInfo?.displayName || call.name,
                    kind: gatewayInfo?.kind || 'tool',
                    status: 'running',
                    parentToolId: invocationId,
                    parentToolName: 'execute_skill_with_context',
                    arguments: sanitizeToolTraceArguments(call.args),
                    executionMode: gatewayInfo?.executionMode,
                    executionLabel: gatewayInfo?.executionLabel,
                  });
                }
              }

              if (type === "tool") {
                const toolName = (msg as any).name;
                const toolCallId = (msg as any).tool_call_id;
                const toolContent = (msg as any).content;
                const toolOutput = typeof toolContent === "string" ? toolContent : JSON.stringify(toolContent);

                const lastCall = toolCalls.find(
                  tc => tc.toolName === toolName && tc.output === ""
                );
                if (lastCall) {
                  lastCall.output = toolOutput;
                }

                const toolId = lastCall?.toolId || (typeof toolCallId === 'string' && toolCallId) || `${toolName}:${Date.now()}`;
                const gatewayInfo = describeGatewayExtendedTool(toolName);

                // 优先�?JSON 响应中的 success 字段判断，避免响应内容包�?"Error" 字面量时误判
                let status: ToolTraceStatus = 'completed';
                try {
                  const parsed = JSON.parse(toolOutput);
                  if (parsed && typeof parsed === 'object') {
                    if (parsed.success === false) status = 'failed';
                    else if (parsed.status === 'CANCELLED') status = 'failed';
                  }
                } catch {
                  // �?JSON 响应：回退到字符串匹配
                  status = toolOutput.includes('CANCELLED') ? 'failed' : 'completed';
                }

                console.log(`[DEBUG] emitToolTraceEvent: toolId=${toolId}, toolName=${toolName}, status=${status}`);

                emitToolTraceEvent({
                  type: 'tool_status',
                  toolId,
                  toolName,
                  displayName: gatewayInfo?.displayName || toolName,
                  kind: gatewayInfo?.kind || 'tool',
                  status,
                  parentToolId: invocationId,
                  parentToolName: 'execute_skill_with_context',
                  arguments: lastCall?.input !== undefined
                    ? sanitizeToolTraceArguments(lastCall.input)
                    : undefined,
                  result: sanitizeToolResultForTrace(toolOutput),
                  executionMode: gatewayInfo?.executionMode,
                  executionLabel: gatewayInfo?.executionLabel,
                });
              }

              // �?Agent 的完�?AI 文本：仅在没�?messages 流式模式时使用（非流式回退�?
              // 如果 messages 模式已推送过文本，这里跳过避免重�?
              if (subAgentTextAccum.length > 0) {
                // messages 模式已推送，updates 模式跳过文本处理
              } else if ((type === "ai" || type === "AIMessageChunk")) {
                const hasToolCalls = ((msg as any).tool_calls?.length > 0);
                let textContent: string;
                if (typeof msg.content === 'string' && msg.content.trim()) {
                  textContent = msg.content;
                } else if (Array.isArray(msg.content)) {
                  textContent = msg.content.map((p: any) => typeof p === 'string' ? p : p?.text ?? '').join('').trim();
                } else if (hasToolCalls) {
                  const toolNames = (msg as any).tool_calls.map((tc: any) => tc.name || 'unknown').join(', ');
                  textContent = `🔧 执行工具: ${toolNames}`;
                } else {
                  textContent = '';
                }
                if (textContent) {
                  subAgentTextAccum = textContent;
                  console.log(`[ThinkBlock] Emitting agent_text (updates fallback): thinkId=${thinkId}, len=${textContent.length}`);
                  emitAgentTextEvent({
                    type: 'agent_text',
                    thinkId,
                    role: 'sub_agent',
                    content: textContent,
                    replace: true,
                  });
                }
              }
            }
          }

          const finalMessages = getMessagesFromPayload(lastPayload);

          if (finalMessages.length > 0) {
            subAgentCache.set(cacheKey, {
              agent,
              messages: finalMessages as BaseMessage[],
              createdAt: Date.now(),
              skillIds: resolvedSkillIds,
            });
          }
          const lastMessage = finalMessages[finalMessages.length - 1];

          if (lastMessage) {
            if (typeof lastMessage.content === "string") {
              output = lastMessage.content;
            } else if (Array.isArray(lastMessage.content)) {
              output = lastMessage.content
                .map((part) => typeof part === "string" ? part : part?.text || "")
                .join("");
            }
          }

          if (!output) {
            for (let i = finalMessages.length - 1; i >= 0; i--) {
              const msg = finalMessages[i];
              if (msg._getType?.() === "tool" || msg.type === "tool") {
                const toolContent = (msg as any).content;
                if (typeof toolContent === "string") {
                  output = toolContent;
                  break;
                }
              }
            }
          }

          // 发射 think_end 事件，标�?think 块完�?
          emitThinkEndEvent({
            type: 'think_end',
            thinkId,
            parentToolId: invocationId,
            status: 'completed',
          });
          clearActiveThinkId(invocationId);

          // 标记 tool_status 完成
          emitToolTraceEvent({
            type: 'tool_status',
            toolId: invocationId,
            toolName: 'execute_skill_with_context',
            displayName: '子Agent 执行',
            kind: 'skill',
            status: 'completed',
          });

          // 只返回精简结果给主 Agent——详细工具执行过程已通过 tool_status 事件流式推送到前台
          return JSON.stringify({
          status: "SUCCESS",
          message: `Sub-agent completed with ${resolvedSkillIds.length} skills: ${matchedSkillNames.join(', ')}`,
          executedSkillIds: resolvedSkillIds,
          matchedSkills: matchedSkillNames.map((name, i) => ({
            id: resolvedSkillIds[i],
            name,
          })),
          result: output || "No output generated",
          conversationCached: subAgentCache.has(cacheKey),
        });
        } catch (error) {
          // 用户取消确认（confirmed: false）—�?不是错误，直接返回取消状�?
          // 不要让子 Agent 看到这个"错误"然后重试
          if (error && typeof error === 'object' && (error as any).confirmed === false) {
            console.log(`[ThinkBlock] User cancelled confirmation, thinkStarted=${thinkStarted}`);
            if (thinkStarted) {
              emitThinkEndEvent({
                type: 'think_end',
                thinkId,
                parentToolId: invocationId,
                status: 'failed',
              });
              clearActiveThinkId(invocationId);
            }
            // 标记父节�?tool_status 为取�?
            emitToolTraceEvent({
              type: 'tool_status',
              toolId: invocationId,
              toolName: 'execute_skill_with_context',
              displayName: '子Agent 执行',
              kind: 'skill',
              status: 'failed',
            });
            return JSON.stringify({
              status: "CANCELLED",
              message: "用户取消了操作",
              result: "操作已取消",
            });
          }

          // 检�?LangGraph 中断信号，重新抛出以便主 Agent 处理确认请求
          // 注意：这里不发射 think_end，保持思考块活跃，确认后继续使用同一个思考块
          if (isGraphInterrupt(error) || (error && typeof error === 'object' && '__interrupt__' in error)) {
            throw error;
          }

          const errMsg = `Error executing skill: ${error instanceof Error ? error.message : String(error)}`;
          console.log(`[ThinkBlock] Sub-agent error: ${errMsg}, thinkStarted=${thinkStarted}`);
          
          // 检测子 Agent 调用了不存在的工具（�?execute_skill_with_context�?
          // 这种情况需要告知主 Agent 重新进行向量检�?
          const toolNotFound = errMsg.includes('Tool') && (errMsg.includes('not found') || errMsg.includes('not exist'));
          
          try {
            // 发射 think_end 通知前端 think 块失�?
            if (thinkStarted) {
              emitThinkEndEvent({
                type: 'think_end',
                thinkId,
                parentToolId: invocationId,
                status: toolNotFound ? 'retry' : 'failed',
              });
              clearActiveThinkId(invocationId);
            }
            // 标记父节�?tool_status 为失�?
            emitToolTraceEvent({
              type: 'tool_status',
              toolId: invocationId,
              toolName: 'execute_skill_with_context',
              displayName: '子Agent 执行',
              kind: 'skill',
              status: 'failed',
            });
            emitToolTraceEvent({
              type: 'tool_status',
              toolId: `sub_error_${Date.now()}`,
              toolName: 'execute_skill_with_context',
              displayName: '子Agent 执行错误',
              kind: 'tool',
              status: 'failed',
              parentToolId: invocationId,
              parentToolName: 'execute_skill_with_context',
              result: sanitizeToolResultForTrace(errMsg),
            });
          } catch {
            // trace context may not be available at this point
          }
          
          if (toolNotFound) {
            // �?Agent 调用了不存在的工具，返回特殊状态让�?Agent 重新进行向量检�?
            return JSON.stringify({
              status: "TOOL_NOT_FOUND",
              message: `�?Agent 尝试调用不存在的工具: ${errMsg}。请尝试更换关键词重新检索技能，或确保所需技能已启用。`,
              executedSkillIds: resolvedSkillIds || [],
              result: "",
              suggestRetry: true,
            });
          }
          
          return JSON.stringify({
            status: "ERROR",
            message: errMsg,
            executedSkillIds: resolvedSkillIds || [],
            result: "",
          });
        }
      },
    });
  }
}
