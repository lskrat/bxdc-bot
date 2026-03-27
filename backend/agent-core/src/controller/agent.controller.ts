import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { AgentFactory } from '../agent/agent';
import { MemoryService } from '../mem/memory.service';
import { SkillManager } from '../skills/skill.manager';
import { LoggerService } from '../utils/logger.service';
import { describeGatewayExtendedTool } from '../tools/java-skills';

type ToolStatus = 'running' | 'completed' | 'failed';

interface NormalizedToolEvent {
  type: 'tool_status';
  toolId: string;
  toolName: string;
  displayName: string;
  kind: 'skill' | 'tool';
  status: ToolStatus;
}

interface ExtractedToolCall {
  toolId: string;
  toolName: string;
  status: ToolStatus;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getChunkMessages(chunk: any): any[] {
  if (!chunk || typeof chunk !== 'object') return [];

  return [
    ...asArray(chunk.agent?.messages),
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
      };
    })
    .filter(Boolean) as ExtractedToolCall[];
}

function extractCompletedToolCall(message: any): ExtractedToolCall | null {
  if (!isToolMessage(message)) return null;

  const toolName = normalizeToolName(message, message?.kwargs?.name);
  if (!toolName) return null;

  return {
    toolId: normalizeToolId(message, toolName),
    toolName,
    status: normalizeToolStatus(message),
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

  private emitToolEvents(subject: Subject<MessageEvent>, chunk: any, seenToolStatuses: Map<string, ToolStatus>) {
    const chunkMessages = getChunkMessages(chunk);
    for (let messageIndex = 0; messageIndex < chunkMessages.length; messageIndex += 1) {
      const message = chunkMessages[messageIndex];
      const startedCalls = extractStartedToolCalls(message, messageIndex);
      for (const startedCall of startedCalls) {
        this.emitToolEvent(subject, startedCall, seenToolStatuses);
      }

      const completedCall = extractCompletedToolCall(message);
      if (completedCall) {
        this.emitToolEvent(subject, completedCall, seenToolStatuses);
      }
    }
  }

  private emitToolEvent(
    subject: Subject<MessageEvent>,
    toolCall: ExtractedToolCall,
    seenToolStatuses: Map<string, ToolStatus>,
  ) {
    const previousStatus = seenToolStatuses.get(toolCall.toolId);
    if (previousStatus === toolCall.status) return;

    seenToolStatuses.set(toolCall.toolId, toolCall.status);
    const toolInfo = describeGatewayExtendedTool(toolCall.toolName) ?? this.skillManager.describeTool(toolCall.toolName);
    const event: NormalizedToolEvent = {
      type: 'tool_status',
      toolId: toolCall.toolId,
      toolName: toolCall.toolName,
      displayName: toolInfo.displayName,
      kind: toolInfo.kind,
      status: toolCall.status,
    };

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
    const { instruction, context, history = [] } = body;
    const userId = context?.userId;
    const subject = new Subject<MessageEvent>();

    // In a real app, these would come from config/env
    const gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
    const apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';
    
    // Model configuration
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4';
    const baseUrl = process.env.OPENAI_API_BASE;

    const skillContext = this.skillManager.buildSkillPromptContext();
    
    // Add confirmation instructions
    const confirmationContext = `
[Tool Confirmation Instructions]
If a tool returns a response with status "CONFIRMATION_REQUIRED", you MUST NOT proceed with the action.
Instead, you MUST output the confirmation request to the user exactly as requested by the tool, and ask for their approval.
If the user approves, you should call the tool again, this time including '"confirmed": true' in the tool parameters.
If the user denies, acknowledge the cancellation and do not execute the tool.
`;

    // Run agent asynchronously
    (async () => {
      let fullAssistantResponse = '';
      const seenToolStatuses = new Map<string, ToolStatus>();
      try {
        const agent = await AgentFactory.createAgent(
          gatewayUrl,
          apiToken,
          openAiApiKey,
          { modelName, baseUrl },
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
        
        const fullInstruction = `${skillContext}${confirmationContext}${memoryContext}User Instruction:\n${instruction}`;

        // Combine history (short-term memory) with current instruction
        const messages = [
          ...history,
          { role: 'user', content: fullInstruction }
        ];

        this.logger.logLlm('input', {
          userId,
          instruction,
          historyCount: history.length,
          fullMessageList: messages
        });

        const stream = await agent.stream({ messages });

        for await (const chunk of stream as any) {
          // Log intermediate interactions
          if (chunk.agent) {
            this.logger.logLlm('agent_thought', chunk.agent);
          } else if (chunk.tools) {
            this.logger.logLlm('tool_result', chunk.tools);
          }

          subject.next({ data: JSON.stringify(chunk) });
          this.emitToolEvents(subject, chunk, seenToolStatuses);

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
        
        this.logger.logLlm('output', {
          userId,
          response: fullAssistantResponse
        });

        subject.complete();

        // Process Memory
        const safeAssistantResponse = (fullAssistantResponse && typeof fullAssistantResponse === 'string') ? fullAssistantResponse : ' ';
        console.log(`[Memory] Analysis started. User: "${instruction}", Agent: "${safeAssistantResponse.slice(0, 50)}..."`);
        
        if (instruction) {
            const sessionId = context?.sessionId || 'default-session';
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
    })();

    return subject.asObservable();
  }
}
