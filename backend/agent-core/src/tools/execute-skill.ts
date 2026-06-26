/**
 * 技能执行工具模块
 * 
 * 模块职责：
 * - 根据搜索结果创建子 Agent 并执行特定技能
 * - 子 Agent 加载指定的技能列表进行执行
 * - 支持多步操作，复用子 Agent 实例，保持对话状态
 * - 执行完成后返回结果给主 Agent
 * - 支持流式返回每一步工具调用结果
 * 
 * 设计说明：
 * - 接收技能 ID 列表和用户输入
 * - 创建子 Agent 实例并缓存，支持多步复用
 * - 使用流式执行子 Agent，实时返回每步结果
 * - 返回格式化的执行结果给主 Agent
 * - 缓存的子 Agent 有过期时间，自动清理
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
import {
  emitToolTraceEvent,
  getActiveParentToolId,
  sanitizeToolTraceArguments,
  sanitizeToolResultForTrace,
  type ToolTraceStatus,
} from "./tool-trace-context";
import { describeGatewayExtendedTool } from "./java-skills";
import { interrupt, isGraphInterrupt, INTERRUPT } from "@langchain/langgraph";

/**
 * 从 payload 中提取中断条目
 */
function extractInterruptEntries(payload: unknown): Array<{ value?: unknown }> {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const arr = p[INTERRUPT] ?? p.__interrupt__;
  return Array.isArray(arr) ? arr : [];
}

const executeSkillInputSchema = z.object({
  skillIds: z
    .array(z.number())
    .min(1)
    .describe("List of skill IDs to load in the sub-agent for execution. " +
      "You can extract these IDs from the skills array returned by search_tools (each skill has an 'id' field)."),
  userInput: z
    .string()
    .min(1)
    .describe("The user's input or task to be executed by the sub-agent. " +
      "IMPORTANT: When the task is about operating on a file (read/edit/parse/convert/aggregate/download a document, Excel, Word, etc.), " +
      "you MUST include the concrete file id(s) in this text (e.g. \"对 fileId=12 的 Excel 做汇总\"), " +
      "extracting the file id mainly from prior tool results or the conversation context. " +
      "Do NOT describe the file only by name or vaguely (e.g. \"处理那个 Excel\") — the sub-agent cannot reliably resolve which file without an id. " +
      "Only omit the file id if no file id can be extracted from tool results or the conversation context; in that case explicitly state that the file id is unknown."),
  continueConversation: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to continue the previous conversation with the same sub-agent. " +
      "When true, the sub-agent will reuse the previous conversation history. " +
      "When false (default), a new conversation will start."),
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
 * 技能执行工具（内置名：`execute_skill_with_context`）
 * 
 * 根据指定的技能 ID 列表创建子 Agent，并执行用户任务。
 * 子 Agent 支持多步操作，会自动缓存和复用，保持对话状态。
 * 支持流式返回每一步工具调用结果。
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
     * 当前对话的 conversationId，必须传给子 Agent，否则子 Agent 调 file tool 时
     * gateway 拿不到 X-Conversation-Id header，导致 enabled_files / conversationId
     * 隔离完全失效。
     */
    private readonly conversationId?: string,
  ) {
    super({
      name: "execute_skill_with_context",
      description:
        "Create or reuse a sub-agent with specific skills and execute the user's task. " +
        "WORKFLOW: First call search_tools to find relevant skills, then extract the 'id' numbers " +
        "from the returned skills array and pass them here as skillIds. " +
        "The sub-agent will be dynamically created with only those specific skills loaded, " +
        "executes the userInput task, and returns the result. " +
        "SUPPORT MULTI-STEP: The sub-agent is cached and can handle multiple steps. " +
        "For subsequent steps with the same skills, set continueConversation to true " +
        "to continue the conversation instead of creating a new sub-agent. " +
        "After receiving the result, you can continue planning or summarize for the user. " +
        "FILE TASKS: if the task operates on a file, the userInput you pass MUST carry the concrete file id(s) " +
        "(resolve them from file_list / previous tool results / conversation context before calling this tool); " +
        "only pass it without a file id when none is genuinely available.",
      schema: executeSkillInputSchema,
      func: async (args) => {
        try {
          const { skillIds, userInput, continueConversation } = args;
          const cacheKey = getCacheKey(skillIds, userId);

          let agent: any;
          let messages: BaseMessage[];

          if (continueConversation && subAgentCache.has(cacheKey)) {
            const cached = subAgentCache.get(cacheKey)!;
            agent = cached.agent;
            messages = [...cached.messages];
            messages.push(new HumanMessage(userInput));
          } else {
            const { agent: newAgent } = await AgentFactory.createSubAgent(
              gatewayUrl,
              apiToken,
              openAiApiKey,
              skillIds,
              {
                modelName: llmConfig?.modelName || "gpt-4",
                baseUrl: llmConfig?.baseUrl,
                // open spec: conversation-file-isolation — 把 conversationId 透传给子 Agent，
                // 子 Agent 调 file tool 时会作为 X-Conversation-Id 传给 gateway，
                // 否则子 Agent 调出来的临时文件 conversationId 都是 NULL
                conversationId: this.conversationId,
              },
              userId
            );
            agent = newAgent;
            // 子 Agent 负责调用工具完成操作，描述每步执行结果，但不做总结
            // 所有总结和概括由主 Agent 统一完成
            const subAgentSystemInstruction =
              "【重要输出规范】\n" +
              "• 你的工作是调用工具完成操作。每步工具调用完成后，简要描述执行了什么操作以及结果。\n" +
              "• 不要做总结、推测或概括性陈述——所有总结由主 Agent 负责。\n" +
              "• 不要在中间步骤说「现在进行下一步」「接下来...」等引导性文字。\n" +
              "• 工具返回的结果中的详细数据和表格由主 Agent 后续呈现，你无需重复大段数据。\n" +
              "• 【文件操作】优先使用任务（userInput）中已给出的 fileId；若未给出，则从工具返回内容或对话上下文中提取 fileId 再操作，" +
              "不要凭空臆造 fileId。若从工具返回内容和对话上下文都无法提取到 fileId，如实说明文件 id 未知，不要随意选择文件。\n\n";
            const baseSystemPrompt = buildStaticSystemPrompt();
            messages = [
              new SystemMessage(subAgentSystemInstruction + baseSystemPrompt),
              new HumanMessage(userInput),
            ];
            subAgentCache.set(cacheKey, {
              agent,
              messages,
              createdAt: Date.now(),
              skillIds,
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

          // 获取主 Agent 中 execute_skill_with_context 父工具调用的 ID，
          // 使子 Agent 的工具调用作为该父调用的子项显示
          const parentToolId = getActiveParentToolId('execute_skill_with_context');
          const parentToolName = parentToolId ? 'execute_skill_with_context' : undefined;

          const stream = await agent.stream({ messages });
          const iterator = stream[Symbol.asyncIterator]();

          while (true) {
            let raw: any;
            try {
              const result = await iterator.next();
              if (result.done) break;
              raw = result.value;
            } catch (error) {
              // 检测 LangGraph 中断信号，重新抛出以便主 Agent 处理
              if (isGraphInterrupt(error) || (error && typeof error === 'object' && '__interrupt__' in error)) {
                throw error;
              }
              throw error;
            }

            const payload = unwrapLangGraphStreamPayload(raw);
            lastPayload = payload;
            
            // 检测子 Agent 发送的中断信号
            const interruptEntries = extractInterruptEntries(payload);
            if (interruptEntries.length > 0) {
              const interruptData = interruptEntries[0]?.value;
              if (interruptData && typeof interruptData === 'object') {
                // 记录中断的 toolCallId，用于后续工具状态事件匹配
                const pendingInterruptToolCallId = (interruptData as any).toolCallId;
                if (pendingInterruptToolCallId && typeof pendingInterruptToolCallId === 'string') {
                  // 将中断的 toolCallId 保存到对应的工具调用记录中
                  const toolName = (interruptData as any).toolName;
                  if (toolName) {
                    const pendingCall = toolCalls.find(tc => tc.toolName === toolName && tc.output === "");
                    if (pendingCall) {
                      pendingCall.toolId = pendingInterruptToolCallId;
                    }
                  }
                }
                // 重新抛出中断信号，让主 Agent 处理
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
            
            const streamMessages = payload?.messages || [];

            for (const msg of streamMessages) {
              const type = msg._getType?.() ?? (msg as any).type ?? "";

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
                    ...(parentToolId ? { parentToolId, parentToolName } : {}),
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

                const status: ToolTraceStatus =
                  toolOutput.includes('CANCELLED') || toolOutput.includes('Error') ? 'failed' : 'completed';

                console.log(`[DEBUG] emitToolTraceEvent: toolId=${toolId}, toolName=${toolName}, status=${status}, lastCall?.toolId=${lastCall?.toolId}, toolCallId=${toolCallId}`);
                
                emitToolTraceEvent({
                  type: 'tool_status',
                  toolId,
                  toolName,
                  displayName: gatewayInfo?.displayName || toolName,
                  kind: gatewayInfo?.kind || 'tool',
                  status,
                  ...(parentToolId ? { parentToolId, parentToolName } : {}),
                  arguments: lastCall?.input !== undefined
                    ? sanitizeToolTraceArguments(lastCall.input)
                    : undefined,
                  result: sanitizeToolResultForTrace(toolOutput),
                  executionMode: gatewayInfo?.executionMode,
                  executionLabel: gatewayInfo?.executionLabel,
                });
              }

              // 子 Agent 的 AI 文本不向前台转发（总结由主 Agent 负责）
              if ((type === "ai" || type === "AIMessageChunk") && !((msg as any).tool_calls?.length > 0)) {
                // 中间 AI 文本不输出到前台，避免干扰主 Agent 的总结
              }
            }
          }

          if (lastPayload?.messages) {
            subAgentCache.set(cacheKey, {
              agent,
              messages: lastPayload.messages as BaseMessage[],
              createdAt: Date.now(),
              skillIds,
            });
          }

          const finalMessages = lastPayload?.messages || [];
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

          // 只返回精简结果给主 Agent——详细工具执行过程已通过 tool_status 事件流式推送到前台
          return JSON.stringify({
            status: "SUCCESS",
            message: "Sub-agent execution completed successfully",
            executedSkillIds: skillIds,
            result: output || "No output generated",
            conversationCached: subAgentCache.has(cacheKey),
          });
        } catch (error) {
          // 检测 LangGraph 中断信号，重新抛出以便主 Agent 处理确认请求
          if (isGraphInterrupt(error) || (error && typeof error === 'object' && '__interrupt__' in error)) {
            throw error;
          }
          
          const errMsg = `Error executing skill: ${error instanceof Error ? error.message : String(error)}`;
          try {
            const parentToolId = getActiveParentToolId('execute_skill_with_context');
            emitToolTraceEvent({
              type: 'tool_status',
              toolId: `sub_error_${Date.now()}`,
              toolName: 'execute_skill_with_context',
              displayName: '子Agent 执行错误',
              kind: 'tool',
              status: 'failed',
              ...(parentToolId ? { parentToolId, parentToolName: 'execute_skill_with_context' } : {}),
              result: sanitizeToolResultForTrace(errMsg),
            });
          } catch {
            // trace context may not be available at this point
          }
          return JSON.stringify({
            status: "ERROR",
            message: errMsg,
            executedSkillIds: args.skillIds,
            result: "",
          });
        }
      },
    });
  }
}