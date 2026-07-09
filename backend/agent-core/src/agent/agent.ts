/**
 * Agent 工厂模块
 * 
 * 模块职责：
 * 1. 创建和配置 LangGraph ReAct Agent 实例
 * 2. 集成 OpenAI LLM 模型
 * 3. 注入 Java Skill Gateway 提供的各类工具
 * 4. 管理 Agent 状态检查点（checkpoint）用于中断/恢复
 * 
 * 核心流程：
 * 1. 根据配置创建 ChatOpenAI 实例
 * 2. 收集所有可用工具（条件暴露的 SSH、计算、Linux 脚本、服务器查询等；**默认不挂载** built-in `api_caller`）
 * 3. 加载 Gateway 扩展工具（动态技能）
 * 4. 使用 createReactAgent 创建 ReAct 架构 Agent
 * 5. 配置共享的 MemorySaver 用于状态持久化
 * 
 * 工具说明：
 * - JavaSkillGeneratorTool（来自 skill-generator.ts）: 技能生成工具
 * - JavaComputeTool: 数学计算工具
 * - JavaServerLookupTool: 服务器信息查询工具
 * - GatewayExtendedTools: 从 Skill Gateway 动态加载的扩展技能（含 SSH Extension Skill）
 * - ManageTasksTool: 任务状态管理工具
 * 
 * 环境变量：
 * - AGENT_BUILTIN_SKILL_DISPATCH: 内置技能路由模式（legacy/gateway）
 * 
 * @module AgentFactory
 * @author Agent Core Team
 * @since 1.0.0
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import type { ClientOptions } from "openai";
import { composeOpenAiCompatibleFetch } from "../utils/llm-request-role-normalize";
import {
  JavaComputeTool,
  JavaServerLookupTool,
  loadGatewayExtendedTools,
  getAgentBuiltinSkillDispatch,
  type BindableAgentTool,
} from "../tools/java-skills";
import { JavaSkillGeneratorTool } from "../tools/skill-generator";
import { ManageTasksTool } from "../tools/manage-tasks";
import { ExecuteSkillWithContextTool } from "../tools/execute-skill";
import { AgentAnnotation, preModelHook } from "./tasks-state";
import type { SkillManager } from "../skills/skill.manager";
import { SkillManager as SkillManagerImpl } from "../skills/skill.manager";

/**
 * 共享的进程内检查点存储
 * 
 * 用途：支持 LangGraph 的中断/恢复机制
 * - 在技能确认流程中，Agent 可以被中断等待用户确认
 * - 用户确认后，从检查点恢复继续执行
 * - 使用 MemorySaver 实现内存级别的状态存储（单进程）
 * 
 * 相关设计：skill-confirmation-react-redesign
 */
const sharedAgentCheckpointer = new MemorySaver();

/**
 * 决定 ChatOpenAI 是否用流式响应
 * - 内网 GLM 模型强制非流式：智谱 GLM 流式响应有 stop_reason 数字等
 *   非标准字段 + 缺 message 字段，会导致 LangChain ChatOpenAI 解析时崩
 *   `Cannot read properties of undefined (reading 'message')`。虽然
 *   llm-request-role-normalize.ts 已做 SSE 写回清洗，但最稳妥的做法是
 *   直接关闭 GLM 的流式，走非流式 JSON 响应（标准 OpenAI 格式，有 message）
 * - 其他模型按 .env AGENT_STREAMING 决定（默认 true 流式）
 */
function shouldStreamModel(modelName: string): boolean {
  if (!modelName) return true;
  // 匹配 GLM-4 / GLM_4 / glm-4 / glm4 系列（含 GLM-4.5 / 4.6 / 4.7 / 4-Flash 等）
  if (/^glm[-_]?4\b/i.test(modelName)) return false;
  return String(process.env.AGENT_STREAMING ?? "true").toLowerCase() !== "false";
}

/**
 * 千问模型（qwen/qwen-xl 等）的思考模式（enable_thinking）默认开启，
 * 会在响应中注入 reasoning_content 导致 token 浪费和响应延迟。
 * 可通过 .env 设置 QWEN_DISABLE_THINKING=false 开启思考模式。
 * 千问非思考模型会忽略该参数，安全。
 */
function isQwenModel(modelName: string): boolean {
  if (!modelName) return false;
  return /^qwen/i.test(modelName);
}

function shouldDisableQwenThinking(): boolean {
  return String(process.env.QWEN_DISABLE_THINKING ?? "true").toLowerCase() !== "false";
}

/**
 * Agent 工厂类
 * 
 * 职责：封装 Agent 创建逻辑，提供统一的 Agent 实例化接口
 * 
 * 设计模式：工厂模式（Factory Pattern）
 * - 将复杂的 Agent 创建逻辑封装在工厂方法中
 * - 调用方只需提供必要的配置参数，无需了解内部实现细节
 */
export class AgentFactory {
  // open spec: optimize-agent-prompt-and-skill-mounting
  // Class-level state for one-shot startup logs and warnings.
  private static legacyWarned = false;
  private static toolListLogged = false;
  // SkillManager is used by SearchFilesystemSkillsTool inside the main agent.
  // Constructed lazily on first createMainAgent call (reads SKILLs/ directory
  // from disk; cheap to construct but we cache to avoid repeat disk scans).
  private static sharedSkillManager: SkillManager | null = null;

  private static getSkillManager(): SkillManager {
    if (!AgentFactory.sharedSkillManager) {
      AgentFactory.sharedSkillManager = new SkillManagerImpl();
    }
    return AgentFactory.sharedSkillManager;
  }
  /**
   * 创建主 Agent（携带基础工具和用户自定义技能）
   * 
   * 主 Agent 包含以下工具：
   * - execute_skill_with_context: 自动向量检索匹配技能 + 创建子 Agent 执行任务
   * - skill_generator: 技能生成工具，用于创建新技能
   * - compute: 数学计算工具
   * - server_lookup: 服务器信息查询工具
   * - manage_tasks: 任务状态管理工具
   * - 用户自定义技能: 从 Gateway /api/skills 获取的扩展技能
   * 
   * 主 Agent 的工作流程：
   * 1. 接收用户问题
   * 2. 调用 execute_skill_with_context（不传 skillIds），内部自动向量检索匹配系统技能
   * 3. 子 Agent 从匹配结果中加载技能并执行任务
   * 4. 收到子 Agent 结果后继续规划或总结回答
   * 
   * 设计原则：
   * - 主 Agent 负责规划和协调，包含用户自定义技能
   * - 子 Agent 负责执行 system_skills 中的内置技能
   * - 实现两级 Agent 架构，实现技能按需加载
   * - 技能检索由后端向量检索完成，主 Agent 无需 search_tools
   * 
   * @param gatewayUrl - Java Skill Gateway 的基础 URL
   * @param apiToken - API 认证令牌
   * @param openAiApiKey - OpenAI API Key
   * @param config - 可选配置项
   * @param userId - 用户标识符
   * 
   * @returns 包含 agent 和 plannerModel 的对象
   */
  static async createMainAgent(
    gatewayUrl: string,
    apiToken: string,
    openAiApiKey: string,
    config?: { modelName?: string, baseUrl?: string, callbacks?: any[], sessionId?: string, conversationId?: string, forcedSkillIds?: number[] },
    userId?: string,
  ): Promise<{
    agent: ReturnType<typeof createReactAgent>;
    plannerModel: ChatOpenAI;
    tools: BindableAgentTool[];
  }> {
    // 构建 OpenAI 客户端配置
    const openAiConfiguration: ClientOptions = {};
    if (config?.baseUrl?.trim()) {
      openAiConfiguration.baseURL = config.baseUrl.replace(/\/+$/, "");
    }
    openAiConfiguration.fetch = composeOpenAiCompatibleFetch({
      userId,
      sessionId: config?.sessionId,
    });

    const effectiveModelName = config?.modelName || "gpt-4";
    const useStreaming = shouldStreamModel(effectiveModelName);
    console.log(`[LLM] model=${effectiveModelName}, streaming=${useStreaming}${!useStreaming ? ' (非流式)' : ' (流式)'}`);

    // 创建 LLM 模型实例
    const model = new ChatOpenAI({
      modelName: effectiveModelName,
      apiKey: openAiApiKey,
      ...(Object.keys(openAiConfiguration).length > 0
        ? { configuration: openAiConfiguration }
        : {}),
      temperature: 0,
      callbacks: config?.callbacks,
      streaming: useStreaming,
      ...((isQwenModel(effectiveModelName) && shouldDisableQwenThinking()) ? { modelKwargs: { chat_template_kwargs: { enable_thinking: false } } } : {}),
    });

    // 构建主 Agent 的工具列表
    // 主 Agent 负责规划和协调，包含：
    // 1. 技能执行工具（execute_skill_with_context）- 向量检索 + 创建子 Agent 执行技能
    // 2. 技能生成工具（skill_generator）- 生成新技能
    // 3. 基础计算工具（compute）- 数学计算
    // 4. 服务器查询工具（server_lookup）- 服务器信息查询
    // 5. 任务管理工具（manage_tasks）- 任务状态管理
    // 6. 用户自定义技能（从 Gateway 获取）
    const builtinDispatch = getAgentBuiltinSkillDispatch();
    const baseTools: BindableAgentTool[] = [
      new ExecuteSkillWithContextTool(gatewayUrl, apiToken, openAiApiKey, {
        modelName: config?.modelName,
        baseUrl: config?.baseUrl,
      }, userId, config?.conversationId),
      new JavaSkillGeneratorTool(gatewayUrl, apiToken, config?.conversationId, userId),
      new JavaComputeTool(gatewayUrl, apiToken, { dispatch: builtinDispatch }),
      new JavaServerLookupTool(gatewayUrl, apiToken, userId),
      new ManageTasksTool(),
    ];

    // 决定是否走旧行为（gateway extended tools 直接挂主 Agent）
    const legacyDirectTools = (process.env.AGENT_LEGACY_DIRECT_TOOLS || "").trim().toLowerCase() === "true";
    if (legacyDirectTools && !AgentFactory.legacyWarned) {
      console.warn(
        `[LLM] AGENT_LEGACY_DIRECT_TOOLS=true: main agent mounting extended tools directly (legacy mode). ` +
        `This will increase prompt size; set AGENT_LEGACY_DIRECT_TOOLS=false (default) to use the unified search→execute path.`
      );
      AgentFactory.legacyWarned = true;
    }

    let tools: BindableAgentTool[];
    if (config?.forcedSkillIds && config.forcedSkillIds.length > 0) {
      // open spec: add-slash-skill-invocation
      // 单技能模式：用户在对话框通过 /技能名 显式锁定某个技能 → tools 只包含这一个技能的函数定义。
      // 不要挂 base tools（compute / server_lookup / manage_tasks / search 类等），
      // LLM 的唯一选择就是调用这个技能，从用户自然语言参数中抽取 schema 填充。
      const forcedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
        plannerModel: model,
        availableTools: [],
        sessionId: config?.sessionId,
        conversationId: config?.conversationId,
        enabledSkillIds: config.forcedSkillIds,
        loadFromConversation: false,
      });
      tools = forcedTools;
      console.log(
        `[LLM] Slash skill mode: forcedSkillIds=[${config.forcedSkillIds.join(", ")}] → ${forcedTools.length} forced tool(s), NO base tools mounted`,
      );
    } else if (legacyDirectTools) {
      // 加载用户自定义技能（skill_owner_type=1）
      // 优先按当前会话勾选的技能加载：有 conversationId 时调 /api/skills/by-conversation，
      // 由 gateway 查会话表 enabled_skills 并按用户可见性过滤返回；
      // 无 conversationId（如直连调用）时回退到 by-owner-type=1 全量加载。
      const gatewayExtendedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
        plannerModel: model,
        availableTools: baseTools,
        sessionId: config?.sessionId,
        conversationId: config?.conversationId,
        loadFromConversation: true,
        skillOwnerType: 1, // 用户技能（无 conversationId 时的兜底）
      });
      tools = [...baseTools, ...gatewayExtendedTools];
    } else {
      // 默认模式：base tools + 会话勾选的自定义技能
      // 系统技能由 ExecuteSkillWithContextTool 走向量检索匹配，
      // 但自定义技能（skill_owner_type=1）不在向量索引中，必须直接挂载到主 Agent
      let conversationSkills: BindableAgentTool[] = [];
      if (config?.conversationId && userId) {
        try {
          conversationSkills = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
            plannerModel: model,
            availableTools: baseTools,
            sessionId: config?.sessionId,
            conversationId: config?.conversationId,
            loadFromConversation: true,
          });
          console.log(`[LLM] Loaded ${conversationSkills.length} custom skill(s) for conversation ${config?.conversationId}`);
        } catch (e: any) {
          console.warn(`[LLM] Failed to load custom skills for conversation:`, e?.message);
        }
      }
      tools = [...baseTools, ...conversationSkills];
    }

    // 启动时打印一次主 Agent 工具列表，便于诊断
    if (!AgentFactory.toolListLogged) {
      console.log(`[LLM] Main agent tools: [${tools.map((t) => t.name).join(", ")}] (count=${tools.length})`);
      AgentFactory.toolListLogged = true;
    }

    // 创建主 Agent
    const agent = createReactAgent({
      llm: model,
      tools,
      stateSchema: AgentAnnotation,
      preModelHook,
      checkpointer: sharedAgentCheckpointer,
    });

    return { agent, plannerModel: model, tools };
  }

  /**
   * 创建子 Agent（加载指定的系统技能）
   * 
   * 子 Agent 用于执行特定任务，从 system_skills 表加载指定的内置技能。
   * 
   * @param gatewayUrl - Java Skill Gateway 的基础 URL
   * @param apiToken - API 认证令牌
   * @param openAiApiKey - OpenAI API Key
   * @param skillIds - 要加载的技能 ID 列表（来自向量检索结果）
   * @param config - 可选配置项
   * @param userId - 用户标识符
   * 
   * @returns 包含 agent 和 plannerModel 的对象
   */
  static async createSubAgent(
    gatewayUrl: string,
    apiToken: string,
    openAiApiKey: string,
    skillIds: number[],
    config?: { modelName?: string, baseUrl?: string, callbacks?: any[], sessionId?: string, conversationId?: string },
    userId?: string,
    additionalTools: BindableAgentTool[] = []
  ): Promise<{
    agent: ReturnType<typeof createReactAgent>;
    plannerModel: ChatOpenAI;
    tools: BindableAgentTool[];
  }> {
    // 构建 OpenAI 客户端配置
    const openAiConfiguration: ClientOptions = {};
    if (config?.baseUrl?.trim()) {
      openAiConfiguration.baseURL = config.baseUrl.replace(/\/+$/, "");
    }
    openAiConfiguration.fetch = composeOpenAiCompatibleFetch({
      userId,
      sessionId: config?.sessionId,
    });

    const effectiveModelName = config?.modelName || "gpt-4";
    const useStreaming = shouldStreamModel(effectiveModelName);
    console.log(`[LLM] model=${effectiveModelName}, streaming=${useStreaming}${!useStreaming ? ' (非流式)' : ' (流式)'}`);

    // 创建 LLM 模型实例
    const model = new ChatOpenAI({
      modelName: effectiveModelName,
      apiKey: openAiApiKey,
      ...(Object.keys(openAiConfiguration).length > 0
        ? { configuration: openAiConfiguration }
        : {}),
      temperature: 0,
      callbacks: config?.callbacks,
      streaming: useStreaming,
      ...((isQwenModel(effectiveModelName) && shouldDisableQwenThinking()) ? { modelKwargs: { chat_template_kwargs: { enable_thinking: false } } } : {}),
    });

    // 子 Agent 只加载指定的技能，不加载基础工具
    const gatewayExtendedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
      plannerModel: model,
      availableTools: [],
      sessionId: config?.sessionId,
      conversationId: config?.conversationId,
      enabledSkillIds: skillIds,
      skillOwnerType: 2, // 系统技能
    });

    const tools = [...gatewayExtendedTools, ...additionalTools];

    // 创建子 Agent（独立 checkpointer，避免 token 泄露到主 Agent stream）
    const agent = createReactAgent({
      llm: model,
      tools,
      stateSchema: AgentAnnotation,
      preModelHook,
      checkpointer: new MemorySaver(),
    });

    return { agent, plannerModel: model, tools };
  }

  /**
   * 创建一个配置好的 ReAct Agent（完整版，加载所有技能）
   *
   * @param gatewayUrl - Java Skill Gateway 的基础 URL，用于调用各类技能服务
   * @param apiToken - API 认证令牌，用于访问 Gateway 服务
   * @param openAiApiKey - OpenAI API Key，用于 LLM 调用
   * @param config - 可选配置项
   *   @param config.modelName - LLM 模型名称（默认：gpt-4）
   *   @param config.baseUrl - OpenAI 兼容服务的自定义基础 URL
   *   @param config.callbacks - LLM 回调处理器数组
   *   @param config.sessionId - 会话标识符
   * @param skillManager - 技能管理器实例，用于获取动态技能工具
   * @param userId - 用户标识符，用于用户特定的配置和权限控制
   * 
   * @returns 包含以下属性的对象：
   *   - agent: 创建好的 LangGraph Agent 实例
   *   - plannerModel: 使用的 LLM 模型实例
   *   - baseTools: 基础工具数组
   * 
   * @example
   * ```typescript
   * const { agent, plannerModel, baseTools } = await AgentFactory.createAgent(
   *   'http://localhost:18080',
   *   'token',
   *   'sk-xxx',
   *   { modelName: 'gpt-4', sessionId: 'sess-001' },
   *   skillManager,
   *   'user-001'
   * );
   * ```
   */
  static async createAgent(
    gatewayUrl: string,
    apiToken: string,
    openAiApiKey: string,
    config?: { modelName?: string, baseUrl?: string, callbacks?: any[], sessionId?: string, conversationId?: string },
    skillManager?: SkillManager,
    userId?: string,
    enabledSkillIds?: number[]
  ): Promise<{
    agent: ReturnType<typeof createReactAgent>;
    plannerModel: ChatOpenAI;
    baseTools: BindableAgentTool[];
  }> {
    // 构建 OpenAI 客户端配置
    const openAiConfiguration: ClientOptions = {};
    if (config?.baseUrl?.trim()) {
      openAiConfiguration.baseURL = config.baseUrl.replace(/\/+$/, "");
    }
    // 配置自定义 fetch，用于添加请求头（用户ID、会话ID）
    openAiConfiguration.fetch = composeOpenAiCompatibleFetch({
      userId,
      sessionId: config?.sessionId,
    });

    // streaming 默认开启，启用流式输出实现打字机效果。
    // 内网环境若受 LangChain tiktoken 网络访问影响（导致每次响应卡 30s+），
    // 可通过 .env 设置 AGENT_STREAMING=false 关闭流式响应。
    // 内网 GLM 模型（智谱）强制非流式（见 shouldStreamModel 注释）。
    const effectiveModelName = config?.modelName || "gpt-4";
    const useStreaming = shouldStreamModel(effectiveModelName);
    console.log(`[LLM] model=${effectiveModelName}, streaming=${useStreaming}${!useStreaming ? ' (非流式)' : ' (流式)'}`);

    // 创建 LLM 模型实例
    const model = new ChatOpenAI({
      modelName: effectiveModelName, // 或使用 OneAPI 兼容模型
      // 注意：@langchain/openai v1 使用 apiKey 而非 openAIApiKey
      apiKey: openAiApiKey,
      ...(Object.keys(openAiConfiguration).length > 0
        ? { configuration: openAiConfiguration }
        : {}),
      temperature: 0, // 使用确定性输出，便于调试和复现
      callbacks: config?.callbacks,
      streaming: useStreaming, // 流式输出开关（GLM 强制 false）
      ...((isQwenModel(effectiveModelName) && shouldDisableQwenThinking()) ? { modelKwargs: { chat_template_kwargs: { enable_thinking: false } } } : {}),
    });

    // 获取内置技能路由模式
    const builtinDispatch = getAgentBuiltinSkillDispatch();
    
    // 构建基础工具数组
    // SSH 操作统一通过 SSH Extension Skill（kind: "ssh"）执行，不再注册 ssh_executor / linux_script_executor
    const baseTools: BindableAgentTool[] = [
      new JavaSkillGeneratorTool(gatewayUrl, apiToken, config?.conversationId, userId),
      new JavaComputeTool(gatewayUrl, apiToken, { dispatch: builtinDispatch }),
      new JavaServerLookupTool(gatewayUrl, apiToken, userId),
    ];
    
    // 从 Gateway 加载扩展工具（动态技能），按对话配置过滤
    const gatewayExtendedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
      plannerModel: model,
      availableTools: baseTools,
      sessionId: config?.sessionId,
      // 传 conversationId，让 tool 调 gateway 时 X-Session-Id 用持久化对话 ID 而非 per-turn sessionId
      conversationId: config?.conversationId,
      enabledSkillIds,
    });
    
    // 合并所有工具
    const tools = [
      ...baseTools,
      ...gatewayExtendedTools,
      ...(skillManager?.getLangChainTools() || []),
      new ManageTasksTool(),
    ];

    // 创建 ReAct Agent
    const agent = createReactAgent({
      llm: model,
      tools,
      stateSchema: AgentAnnotation,
      preModelHook,
      checkpointer: sharedAgentCheckpointer,
    });
    return { agent, plannerModel: model, baseTools };
  }
}
