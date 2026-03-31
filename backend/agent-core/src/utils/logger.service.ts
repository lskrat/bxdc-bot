import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { convertMessagesToCompletionsMessageParams } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';

export type LlmLogDirection = 'request' | 'response';

export interface LlmLogEntry {
  id: string;
  sessionId: string;
  invocationId: string;
  direction: LlmLogDirection;
  stage: 'chat_model';
  timestamp: string;
  summary: string;
  modelName?: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface LlmLogEvent {
  type: 'llm_log';
  entry: LlmLogEntry;
}

type LlmCallbackEmitter = (event: LlmLogEvent) => void;

@Injectable()
export class LoggerService {
  private readonly logsDir = path.join(process.cwd(), 'logs');
  private readonly memoryLogPath = path.join(this.logsDir, 'memory.log');
  private readonly llmLogPath = path.join(this.logsDir, 'llm.log');

  constructor() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private writeLog(filePath: string, message: string) {
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${message}\n---\n`;
    fs.appendFileSync(filePath, logEntry, 'utf8');
  }

  private writeJsonLine(filePath: string, value: unknown) {
    fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
  }

  logMemory(action: 'store' | 'retrieve', data: any) {
    const message = `Action: ${action.toUpperCase()}\nData: ${JSON.stringify(data, null, 2)}`;
    this.writeLog(this.memoryLogPath, message);
  }

  logLlm(type: 'input' | 'output' | 'agent_thought' | 'tool_result', data: any) {
    this.writeJsonLine(this.llmLogPath, {
      format: 'legacy',
      type,
      timestamp: new Date().toISOString(),
      data: this.sanitizeValue(data),
    });
  }

  createLlmCallbackHandler(sessionId: string, emit: LlmCallbackEmitter) {
    const runMetadata = new Map<string, { modelName?: string }>();

    return BaseCallbackHandler.fromMethods({
      handleChatModelStart: async (
        serialized: any,
        messages: any,
        runId: string,
        _parentRunId?: string,
        extraParams?: any,
      ) => {
        const modelName = this.extractModelName(serialized, extraParams);
        runMetadata.set(String(runId), { modelName });
        const wireBody = this.buildOpenAiChatCompletionsBody(messages, modelName, extraParams);
        const requestEntry = this.appendLlmEntry({
          sessionId,
          invocationId: String(runId),
          direction: 'request',
          summary: this.buildWireRequestSummary(modelName, wireBody),
          modelName,
          request: {
            protocol: 'OpenAI Chat Completions (request JSON, aligned with POST /v1/chat/completions body)',
            method: 'POST',
            path: '/v1/chat/completions',
            body: wireBody,
          },
        });
        emit({ type: 'llm_log', entry: requestEntry });
      },
      handleLLMEnd: async (output: any, runId: string) => {
        const invocationId = String(runId);
        const modelName = runMetadata.get(invocationId)?.modelName;
        const responsePayload = this.buildOpenAiChatCompletionResponse(output);
        const responseEntry = this.appendLlmEntry({
          sessionId,
          invocationId,
          direction: 'response',
          summary: this.buildResponseSummary(responsePayload),
          modelName,
          response: responsePayload,
        });
        emit({ type: 'llm_log', entry: responseEntry });
      },
      handleLLMError: async (error: any, runId: string) => {
        const invocationId = String(runId);
        const modelName = runMetadata.get(invocationId)?.modelName;
        const responseEntry = this.appendLlmEntry({
          sessionId,
          invocationId,
          direction: 'response',
          summary: 'LLM 调用失败',
          modelName,
          response: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        emit({ type: 'llm_log', entry: responseEntry });
      },
    });
  }

  private appendLlmEntry(input: Omit<LlmLogEntry, 'id' | 'stage' | 'timestamp'>): LlmLogEntry {
    const entry: LlmLogEntry = {
      id: uuidv4(),
      stage: 'chat_model',
      timestamp: new Date().toISOString(),
      ...input,
    };
    this.writeJsonLine(this.llmLogPath, entry);
    return entry;
  }

  private flattenChatModelMessages(messages: any): any[] {
    const batches = Array.isArray(messages) ? messages : [messages];
    const first = batches[0];
    return Array.isArray(first) ? batches.flat() : batches;
  }

  /** Same keys the OpenAI client merges with `messages` for chat.completions (from LangChain `invocation_params` when present). */
  private extractInvocationLike(extraParams: any): Record<string, unknown> {
    if (!extraParams || typeof extraParams !== 'object') return {};
    const inv = extraParams.invocation_params;
    if (inv && typeof inv === 'object' && !Array.isArray(inv) && Object.keys(inv).length > 0) {
      return { ...inv };
    }
    const skip = new Set(['invocation_params', 'options', 'batch_size', 'metadata']);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extraParams)) {
      if (skip.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  private buildOpenAiChatCompletionsBody(
    messages: any,
    modelName: string | undefined,
    extraParams: any,
  ): Record<string, unknown> {
    const flat = this.flattenChatModelMessages(messages);
    const modelForConverter =
      modelName
      ?? (typeof extraParams?.invocation_params?.model === 'string' ? extraParams.invocation_params.model : undefined)
      ?? (typeof extraParams?.model === 'string' ? extraParams.model : undefined);
    let openaiMessages: unknown[];
    try {
      openaiMessages = convertMessagesToCompletionsMessageParams({
        messages: flat,
        model: modelForConverter,
      });
    } catch {
      openaiMessages = this.legacySanitizeToOpenAiWireMessages(messages);
    }
    const invocationLike = this.extractInvocationLike(extraParams);
    const body: Record<string, unknown> = {
      ...invocationLike,
      messages: openaiMessages,
    };
    return this.sanitizeValue(body) as Record<string, unknown>;
  }

  private legacySanitizeToOpenAiWireMessages(messages: any) {
    return this.sanitizeMessages(messages).map((m) => {
      const role =
        m.role === 'human' ? 'user'
        : m.role === 'ai' ? 'assistant'
        : m.role;
      const row: Record<string, unknown> = {
        role,
        content: m.content,
      };
      if (m.name) row.name = m.name;
      if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        row.tool_calls = m.toolCalls;
      }
      return row;
    });
  }

  /** Tool name from OpenAI wire, LangChain tool_calls, or legacy additional_kwargs. */
  private extractToolNameFromCall(call: any): string | null {
    if (call == null || typeof call !== 'object') return null;
    const fn = call.function ?? call.kwargs?.function;
    const fromFn = typeof fn?.name === 'string' ? fn.name.trim() : '';
    if (fromFn) return fromFn;
    const direct = typeof call.name === 'string' ? call.name.trim() : '';
    if (direct) return direct;
    return null;
  }

  private collectRawToolCallsFromMessage(msg: any): any[] {
    if (!msg || typeof msg !== 'object') return [];
    const lists = [
      msg.tool_calls,
      msg.kwargs?.tool_calls,
      msg.additional_kwargs?.tool_calls,
      msg.lc_kwargs?.tool_calls,
    ];
    for (const list of lists) {
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [];
  }

  /** Flat list of invoked tool names for logs (visible even when nested tool_calls hit depth limits). */
  private collectToolsInvokedFromGenerations(generations: any[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of generations) {
      const msg = g?.message;
      for (const call of this.collectRawToolCallsFromMessage(msg)) {
        const name = this.extractToolNameFromCall(call);
        if (name && !seen.has(name)) {
          seen.add(name);
          out.push(name);
        }
      }
    }
    return out;
  }

  private buildOpenAiChatCompletionResponse(output: any): Record<string, unknown> {
    const generations = Array.isArray(output?.generations) ? output.generations.flat(Infinity) : [];
    const toolsInvoked = this.collectToolsInvokedFromGenerations(generations);

    const choices = generations.map((g: any, index: number) => {
      const msg = g?.message;
      const content = this.sanitizeValue(msg?.kwargs?.content ?? msg?.content ?? g?.text ?? '', 0, 6);
      const rawCalls = this.collectRawToolCallsFromMessage(msg);
      const toolCalls = this.sanitizeValue(rawCalls, 0, 8);
      const message: Record<string, unknown> = {
        role: 'assistant',
        content,
      };
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      const labels = rawCalls
        .map((c) => this.extractToolNameFromCall(c))
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      if (labels.length > 0) {
        message.tool_names = labels;
      }
      return {
        index,
        finish_reason: g?.generationInfo?.finish_reason ?? g?.generation_info?.finish_reason ?? null,
        message,
      };
    });

    const llmOut = output?.llmOutput ?? output?.llm_output ?? {};
    const usageRaw = llmOut.tokenUsage ?? llmOut.estimatedTokenUsage ?? {};
    const usage: Record<string, unknown> = {};
    if (usageRaw.promptTokens != null) usage.prompt_tokens = usageRaw.promptTokens;
    if (usageRaw.completionTokens != null) usage.completion_tokens = usageRaw.completionTokens;
    if (usageRaw.totalTokens != null) usage.total_tokens = usageRaw.totalTokens;

    const payload: Record<string, unknown> = {
      object: 'chat.completion',
      choices,
    };
    if (toolsInvoked.length > 0) {
      payload.tools_invoked = toolsInvoked;
    }
    if (Object.keys(usage).length > 0) {
      payload.usage = this.sanitizeValue(usage, 0, 6);
    }
    return this.sanitizeValue(payload, 0, 10) as Record<string, unknown>;
  }

  private inferMessageRole(message: any): string {
    const fromKwargs = message?.kwargs?.role ?? message?.role;
    if (typeof fromKwargs === 'string' && fromKwargs && fromKwargs !== 'constructor') {
      return fromKwargs;
    }
    const topType = message?.type;
    if (typeof topType === 'string' && topType !== 'constructor') {
      return topType;
    }
    if (typeof message?._getType === 'function') {
      try {
        return message._getType();
      } catch {
        /* ignore */
      }
    }
    const id = message?.id;
    if (Array.isArray(id)) {
      const tail = id[id.length - 1];
      if (typeof tail === 'string') {
        if (tail.includes('System')) return 'system';
        if (tail.includes('Human')) return 'human';
        if (tail.includes('AIMessage')) return 'ai';
        if (tail.includes('Tool')) return 'tool';
      }
    }
    return 'unknown';
  }

  private sanitizeMessages(messages: any) {
    const batches = Array.isArray(messages) ? messages : [messages];
    const firstBatch = Array.isArray(batches[0]) ? batches[0] : batches;
    return firstBatch.map((message: any) => ({
      role: this.inferMessageRole(message),
      content: this.sanitizeValue(message?.kwargs?.content ?? message?.content ?? ''),
      name: message?.kwargs?.name ?? message?.name,
      toolCalls: this.sanitizeValue(
        message?.kwargs?.tool_calls
        ?? message?.tool_calls
        ?? message?.additional_kwargs?.tool_calls
        ?? [],
      ),
    }));
  }

  private extractModelName(serialized: any, extraParams: any): string | undefined {
    return serialized?.kwargs?.modelName
      ?? serialized?.kwargs?.model
      ?? extraParams?.model
      ?? extraParams?.modelName
      ?? extraParams?.invocation_params?.model
      ?? undefined;
  }

  private buildWireRequestSummary(modelName: string | undefined, body: Record<string, unknown>): string {
    const msgList = Array.isArray(body.messages) ? body.messages : [];
    const systemCount = msgList.filter((m: any) => m?.role === 'system').length;
    const name = modelName ?? (typeof body.model === 'string' ? body.model : undefined);
    const parts = [
      name ? `模型 ${name}` : 'Chat Completions 请求',
      `${msgList.length} 条 messages`,
    ];
    if (systemCount > 0) {
      parts.push(`含 ${systemCount} 条 system`);
    }
    if (body.stream === true) {
      parts.push('stream');
    }
    return parts.join(' · ');
  }

  private buildResponseSummary(response: Record<string, any>): string {
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const first = choices[0]?.message;
    const text = typeof first?.content === 'string' ? first.content : '';
    const toolsInvoked = Array.isArray(response.tools_invoked) ? response.tools_invoked : [];
    const namesFromMessage = Array.isArray(first?.tool_names) ? first.tool_names : [];
    const toolLabels = toolsInvoked.length > 0 ? toolsInvoked : namesFromMessage;
    const toolCalls = Array.isArray(first?.tool_calls) ? first.tool_calls.length : 0;
    const summaryParts = [];
    if (text) {
      summaryParts.push(`返回 ${text.length > 24 ? `${text.slice(0, 24)}...` : text}`);
    }
    if (toolLabels.length > 0) {
      summaryParts.push(`tools: ${toolLabels.join(', ')}`);
    } else if (toolCalls > 0) {
      summaryParts.push(`${toolCalls} 个 tool call`);
    }
    return summaryParts.join(' · ') || '收到模型响应';
  }

  private isSensitiveLogKey(key: string): boolean {
    const k = key.toLowerCase();
    if (k.includes('apikey') || k.includes('api_key')) return true;
    if (k === 'authorization' || k.includes('authorization')) return true;
    if (k === 'access_token' || k === 'refresh_token' || k === 'id_token') return true;
    if (k === 'token' || k.endsWith('_apitoken')) return true;
    return false;
  }

  private sanitizeValue(value: any, depth = 0, maxDepth = 6): any {
    if (depth > maxDepth) return '[truncated]';
    if (value == null) return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, depth + 1, maxDepth));
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value)) {
        if (this.isSensitiveLogKey(key)) {
          result[key] = '[redacted]';
          continue;
        }
        result[key] = this.sanitizeValue(raw, depth + 1, maxDepth);
      }
      return result;
    }
    return String(value);
  }
}
