import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { AgentFactory } from '../agent/agent';
import { MemoryService } from '../mem/memory.service';
import { SkillManager } from '../skills/skill.manager';
import { LoggerService } from '../utils/logger.service';
import { describeGatewayExtendedTool } from '../tools/java-skills';
import {
  clearActiveParentToolId,
  runWithToolTraceContext,
  sanitizeToolTraceArguments,
  sanitizeToolResultForTrace,
  setActiveParentToolId,
  type ToolTraceEvent,
} from '../tools/tool-trace-context';
import { pickMergedLlm } from '../utils/llm-merge';
import { logAgentRunRawIfEnabled } from '../utils/agent-run-raw-log';

/** Injected into each run as part of the user message (main agent has no separate SystemMessage). */
const AGENT_SKILL_GENERATOR_POLICY = `[Skill generation policy]
Before using the skill_generator tool to create a new extension skill on SkillGateway, you MUST satisfy at least one of:
(1) You have verified that no existing capability can complete the task—this includes built-in tools, gateway extension tools already available, and filesystem skills the user can load via skill tools; OR
(2) The user explicitly asks you to create, add, or register a new skill/extension.

Do not reach for skill_generator as a default. Prefer existing tools and loaded skills first.

`;

const AGENT_TASK_TRACKING_POLICY = `[Task tracking policy]
When the user's request involves multiple distinct sub-tasks (e.g. "check disk AND restart nginx AND verify logs"):
1. Call manage_tasks to register each sub-task with status "pending" or "in_progress" BEFORE starting work.
2. After completing a sub-task, call manage_tasks to mark it "completed".
3. If a sub-task fails or is no longer needed, mark it "cancelled".
4. Do NOT repeat work for tasks already marked completed unless the user explicitly asks.
Use short, stable IDs (e.g. "check-disk", "restart-nginx") so the system can track progress across turns.

`;

type ToolStatus = 'running' | 'completed' | 'failed';

interface ExtractedToolCall {
  toolId: string;
  toolName: string;
  status: ToolStatus;
  arguments?: unknown;
  /** Present when status is completed/failed: tool output (sanitized). */
  result?: string;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getChunkMessages(chunk: any): any[] {
  if (!chunk || typeof chunk !== 'object') return [];

  return [
    ...asArray(chunk.agent?.messages),
    ...asArray(chunk.tools?.messages),
    ...asArray(chunk.messages),
  ];
}

function inferMessageKind(message: any): string {
  const nestedType = message?.kwargs?.type;
  if (typeof nestedType === 'string') return nestedType.toLowerCase();

  const explicitType = message?.type;
  if (typeof explicitType === 'string') return explicitType.toLowerCase();

  const nestedRole = message?.kwargs?.role;
  if (typeof nestedRole === 'string') return nestedRole.toLowerCase();

  const role = message?.role;
  if (typeof role === 'string') return role.toLowerCase();

  const id = message?.id;
  if (typeof id === 'string') return id.toLowerCase();
  if (Array.isArray(id)) return id.join('.').toLowerCase();

  // Fallback: if it looks like a chunk with content
  if (message?.content !== undefined) return 'aimessagechunk';

  return '';
}

function isAssistantMessage(message: any): boolean {
  const kind = inferMessageKind(message);
  return kind.includes('assistant') || kind.includes('aimessage');
}

function isToolMessage(message: any): boolean {
  const kind = inferMessageKind(message);
  return kind.includes('toolmessage') || kind === 'tool';
}

function extractContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
          return (part as any).text;
        }
        return '';
      })
      .join('');
    return text || null;
  }
  return null;
}

function getMessageContent(message: any): string | null {
  return extractContent(message?.kwargs?.content)
    ?? extractContent(message?.lc_kwargs?.content)
    ?? extractContent(message?.content)
    ?? null;
}

function getToolCallEntries(message: any): any[] {
  return [
    ...asArray(message?.tool_calls),
    ...asArray(message?.kwargs?.tool_calls),
    ...asArray(message?.kwargs?.additional_kwargs?.tool_calls),
    ...asArray(message?.additional_kwargs?.tool_calls),
  ];
}

function normalizeToolName(toolCall: any, fallback?: string): string | null {
  const name = toolCall?.name
    ?? toolCall?.function?.name
    ?? toolCall?.kwargs?.name
    ?? fallback;

  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function normalizeToolId(toolCall: any, fallback: string): string {
  const id = toolCall?.id ?? toolCall?.tool_call_id ?? toolCall?.function?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : fallback;
}

/** Prefer OpenAI tool_call_id on ToolMessage so completed events match started tool_calls. */
function normalizeToolIdFromToolMessage(message: any, messageIndex: number, toolName: string): string {
  const id =
    message?.tool_call_id
    ?? message?.kwargs?.tool_call_id
    ?? message?.lc_kwargs?.tool_call_id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return `${toolName}:toolmsg:${messageIndex}`;
}

function parseToolArguments(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'string') return rawArguments;
  const trimmed = rawArguments.trim();
  if (!trimmed) return trimmed;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function extractToolArguments(toolCall: any): unknown {
  return parseToolArguments(
    toolCall?.args
    ?? toolCall?.arguments
    ?? toolCall?.function?.arguments
    ?? toolCall?.kwargs?.args
    ?? toolCall?.kwargs?.arguments,
  );
}

function normalizeToolStatus(message: any): ToolStatus {
  const status = message?.status ?? message?.kwargs?.status;
  if (status === 'error' || status === 'failed') return 'failed';

  const content = getMessageContent(message)?.toLowerCase() ?? '';
  if (content.startsWith('error')) return 'failed';

  return 'completed';
}

function extractStartedToolCalls(message: any, messageIndex: number): ExtractedToolCall[] {
  if (!isAssistantMessage(message)) return [];

  return getToolCallEntries(message)
    .map((toolCall, index) => {
      const toolName = normalizeToolName(toolCall);
      if (!toolName) return null;

      return {
        // Keep fallback id aligned with frontend `extractToolInvocationsFromChunk`
        // so tool_status can upsert and replace initial generic displayName.
        toolId: normalizeToolId(toolCall, `${toolName}:${messageIndex}:${index}`),
        toolName,
        status: 'running' as const,
        arguments: sanitizeToolTraceArguments(extractToolArguments(toolCall)),
      };
    })
    .filter(Boolean) as ExtractedToolCall[];
}

function extractCompletedToolCall(message: any, messageIndex: number): ExtractedToolCall | null {
  if (!isToolMessage(message)) return null;

  const toolName = normalizeToolName(message, message?.kwargs?.name);
  if (!toolName) return null;

  const toolId = normalizeToolIdFromToolMessage(message, messageIndex, toolName);
  const status = normalizeToolStatus(message);
  const content = getMessageContent(message);
  const result =
    content != null && String(content).length > 0
      ? sanitizeToolResultForTrace(String(content))
      : undefined;

  return {
    toolId,
    toolName,
    status,
    result,
  };
}

/**
 * Agent 控制器。
 * <p>
 * 暴露 HTTP 端点以接收任务请求，并通过 SSE 流式返回 Agent 的执行过程。
 * </p>
 */
@Controller('agent')
export class AgentController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly skillManager: SkillManager,
    private readonly logger: LoggerService,
  ) {}

  private emitToolEvents(
    subject: Subject<MessageEvent>,
    chunk: any,
    seenToolStatuses: Map<string, ToolStatus>,
    lastToolArguments: Map<string, unknown>,
    lastEmittedToolResult: Map<string, string | undefined>,
  ) {
    const chunkMessages = getChunkMessages(chunk);
    for (let messageIndex = 0; messageIndex < chunkMessages.length; messageIndex += 1) {
      const message = chunkMessages[messageIndex];
      const startedCalls = extractStartedToolCalls(message, messageIndex);
      for (const startedCall of startedCalls) {
        this.emitToolEvent(
          subject,
          startedCall,
          seenToolStatuses,
          lastToolArguments,
          lastEmittedToolResult,
        );
      }

      const completedCall = extractCompletedToolCall(message, messageIndex);
      if (completedCall) {
        this.emitToolEvent(
          subject,
          completedCall,
          seenToolStatuses,
          lastToolArguments,
          lastEmittedToolResult,
        );
      }
    }
  }

  private emitToolEvent(
    subject: Subject<MessageEvent>,
    toolCall: ExtractedToolCall,
    seenToolStatuses: Map<string, ToolStatus>,
    lastToolArguments: Map<string, unknown>,
    lastEmittedToolResult: Map<string, string | undefined>,
  ) {
    const previousStatus = seenToolStatuses.get(toolCall.toolId);
    const prevEmittedResult = lastEmittedToolResult.get(toolCall.toolId);

    if (previousStatus === toolCall.status) {
      // Streaming may emit completed before tool output is present, then again with content.
      const canReemitCompletedWithResult =
        toolCall.status === 'completed'
        && toolCall.result !== undefined
        && toolCall.result !== prevEmittedResult;
      if (!canReemitCompletedWithResult) {
        return;
      }
    }

    seenToolStatuses.set(toolCall.toolId, toolCall.status);
    if (toolCall.result !== undefined) {
      lastEmittedToolResult.set(toolCall.toolId, toolCall.result);
    }
    const resolvedArguments =
      toolCall.arguments !== undefined
        ? toolCall.arguments
        : lastToolArguments.get(toolCall.toolId);

    if (toolCall.arguments !== undefined) {
      lastToolArguments.set(toolCall.toolId, toolCall.arguments);
    }

    const gatewayToolInfo = describeGatewayExtendedTool(toolCall.toolName);
    const toolInfo = gatewayToolInfo ?? this.skillManager.describeTool(toolCall.toolName);
    const event: ToolTraceEvent = {
      type: 'tool_status',
      toolId: toolCall.toolId,
      toolName: toolCall.toolName,
      displayName: toolInfo.displayName,
      kind: toolInfo.kind,
      status: toolCall.status,
      arguments: sanitizeToolTraceArguments(resolvedArguments),
      ...(toolCall.result !== undefined ? { result: toolCall.result } : {}),
      executionMode: gatewayToolInfo?.executionMode,
      executionLabel: gatewayToolInfo?.executionLabel,
    };

    if (toolCall.status === 'running') {
      setActiveParentToolId(toolCall.toolName, toolCall.toolId);
    } else {
      clearActiveParentToolId(toolCall.toolName, toolCall.toolId);
    }

    subject.next({ data: JSON.stringify(event) });
  }

  /**
   * 运行 Agent 任务。
   * <p>
   * 接收包含指令和上下文的 POST 请求，启动 Agent，并将结果作为 SSE 事件流返回。
   * </p>
   *
   * @param body 请求体，包含 `instruction` (指令), `context` (上下文) 和 `history` (历史对话)
   * @returns Observable<MessageEvent> SSE 事件流
   */
  @Post('run')
  @Sse()
  runTask(@Body() body: { instruction: string; context: any; history?: any[] }): Observable<MessageEvent> {
    const { instruction, context, history } = body;
    const safeHistory = Array.isArray(history) ? history : [];
    const userId = context?.userId;
    const sessionId = context?.sessionId || 'default-session';

    logAgentRunRawIfEnabled(body, { sessionId, userId });

    const subject = new Subject<MessageEvent>();

    // In a real app, these would come from config/env
    const gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
    const apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';

    const llm = pickMergedLlm(context);
    const openAiApiKey = llm.apiKey;
    const modelName = llm.modelName;
    const baseUrl = llm.baseUrl;

    const skillContext = this.skillManager.buildSkillPromptContext();

    // Run agent asynchronously
    runWithToolTraceContext(
      (event) => subject.next({ data: JSON.stringify(event) }),
      async () => {
      let fullAssistantResponse = '';
      const seenToolStatuses = new Map<string, ToolStatus>();
      const lastToolArguments = new Map<string, unknown>();
      const lastEmittedToolResult = new Map<string, string | undefined>();
      try {
        const llmCallbackHandler = this.logger.createLlmCallbackHandler(sessionId, (event) => {
          subject.next({ data: JSON.stringify(event) });
        });
        const agent = await AgentFactory.createAgent(
          gatewayUrl,
          apiToken,
          openAiApiKey,
          { modelName, baseUrl, callbacks: [llmCallbackHandler] },
          this.skillManager,
          userId,
        );

        // Retrieve relevant long-term memories based on current instruction
        const memories = await this.memoryService.searchMemories(instruction, userId, 10);
        console.log(`[Memory] Retrieved ${memories.length} memories for user ${userId}`);
        if (memories.length > 0) {
          console.log(`[Memory] First memory: ${memories[0]}`);
        }
        
        const memoryContext = memories.length > 0 
          ? `[User Profile & Preferences]\n${memories.map(m => `- ${m}`).join('\n')}\n\nWhen the user asks about their profile or family (e.g. 籍贯、家乡、喜好、昵称、我儿子叫啥、我女儿叫什么、我爱人叫什么), you MUST answer using the relevant information above and state it explicitly (e.g. "你儿子叫yoyo" when they ask 我儿子叫啥). Do not proactively list all facts unless asked.\n\n` 
          : '';
        
        const fullInstruction = `${skillContext}${AGENT_SKILL_GENERATOR_POLICY}${AGENT_TASK_TRACKING_POLICY}${memoryContext}User Instruction:\n${instruction}`;

        // Combine history (short-term memory) with current instruction
        // OpenAI-style roles only; drop unknown roles. Assistant turns stay `assistant`.
        const allowedHistoryRoles = new Set(['user', 'assistant', 'system']);
        const validHistory = safeHistory
          .map((m) => {
            const role = m?.role;
            if (typeof role !== 'string') return null;
            const lr = role.toLowerCase();
            if (!allowedHistoryRoles.has(lr)) return null;
            return { ...m, role: lr };
          })
          .filter((m): m is NonNullable<typeof m> => m != null);

        const messages = [
          ...validHistory,
          { role: 'user', content: fullInstruction }
        ];

        const stream = await agent.stream({ messages });

        for await (const chunk of stream as any) {
          subject.next({ data: JSON.stringify(chunk) });
          this.emitToolEvents(subject, chunk, seenToolStatuses, lastToolArguments, lastEmittedToolResult);

          // Try to extract assistant response from chunk for memory processing
          if (chunk && typeof chunk === 'object') {
            const lastAssistantMessage = getChunkMessages(chunk)
              .filter((message) => isAssistantMessage(message))
              .at(-1);

            const nextContent = getMessageContent(lastAssistantMessage);
            if (nextContent) {
              fullAssistantResponse = nextContent;
              // Also emit simplified event for frontend compatibility
              // This ensures that even if the chunk structure is complex, the frontend receives a clear content update
              subject.next({ data: JSON.stringify({ role: 'assistant', content: nextContent }) });
            }
          }
        }

        subject.complete();

        // Process Memory
        const safeAssistantResponse = (fullAssistantResponse && typeof fullAssistantResponse === 'string') ? fullAssistantResponse : ' ';
        console.log(`[Memory] Analysis started. User: "${instruction}", Agent: "${safeAssistantResponse.slice(0, 50)}..."`);
        
        if (instruction) {
            await this.memoryService.processTurn({
                sessionId,
                userId,
                userText: instruction,
                assistantText: safeAssistantResponse
            });
        }

      } catch (error) {
        subject.next({ data: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) });
        subject.complete();
      }
    }).catch((error) => {
      subject.next({ data: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) });
      subject.complete();
    });

    return subject.asObservable();
  }
}
