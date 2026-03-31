"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const base_1 = require("@langchain/core/callbacks/base");
const openai_1 = require("@langchain/openai");
const uuid_1 = require("uuid");
let LoggerService = class LoggerService {
    logsDir = path.join(process.cwd(), 'logs');
    memoryLogPath = path.join(this.logsDir, 'memory.log');
    llmLogPath = path.join(this.logsDir, 'llm.log');
    constructor() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }
    writeLog(filePath, message) {
        const timestamp = new Date().toLocaleString();
        const logEntry = `[${timestamp}] ${message}\n---\n`;
        fs.appendFileSync(filePath, logEntry, 'utf8');
    }
    writeJsonLine(filePath, value) {
        fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
    }
    logMemory(action, data) {
        const message = `Action: ${action.toUpperCase()}\nData: ${JSON.stringify(data, null, 2)}`;
        this.writeLog(this.memoryLogPath, message);
    }
    logLlm(type, data) {
        this.writeJsonLine(this.llmLogPath, {
            format: 'legacy',
            type,
            timestamp: new Date().toISOString(),
            data: this.sanitizeValue(data),
        });
    }
    createLlmCallbackHandler(sessionId, emit) {
        const runMetadata = new Map();
        return base_1.BaseCallbackHandler.fromMethods({
            handleChatModelStart: async (serialized, messages, runId, _parentRunId, extraParams) => {
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
            handleLLMEnd: async (output, runId) => {
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
            handleLLMError: async (error, runId) => {
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
    appendLlmEntry(input) {
        const entry = {
            id: (0, uuid_1.v4)(),
            stage: 'chat_model',
            timestamp: new Date().toISOString(),
            ...input,
        };
        this.writeJsonLine(this.llmLogPath, entry);
        return entry;
    }
    flattenChatModelMessages(messages) {
        const batches = Array.isArray(messages) ? messages : [messages];
        const first = batches[0];
        return Array.isArray(first) ? batches.flat() : batches;
    }
    extractInvocationLike(extraParams) {
        if (!extraParams || typeof extraParams !== 'object')
            return {};
        const inv = extraParams.invocation_params;
        if (inv && typeof inv === 'object' && !Array.isArray(inv) && Object.keys(inv).length > 0) {
            return { ...inv };
        }
        const skip = new Set(['invocation_params', 'options', 'batch_size', 'metadata']);
        const out = {};
        for (const [k, v] of Object.entries(extraParams)) {
            if (skip.has(k))
                continue;
            out[k] = v;
        }
        return out;
    }
    buildOpenAiChatCompletionsBody(messages, modelName, extraParams) {
        const flat = this.flattenChatModelMessages(messages);
        const modelForConverter = modelName
            ?? (typeof extraParams?.invocation_params?.model === 'string' ? extraParams.invocation_params.model : undefined)
            ?? (typeof extraParams?.model === 'string' ? extraParams.model : undefined);
        let openaiMessages;
        try {
            openaiMessages = (0, openai_1.convertMessagesToCompletionsMessageParams)({
                messages: flat,
                model: modelForConverter,
            });
        }
        catch {
            openaiMessages = this.legacySanitizeToOpenAiWireMessages(messages);
        }
        const invocationLike = this.extractInvocationLike(extraParams);
        const body = {
            ...invocationLike,
            messages: openaiMessages,
        };
        return this.sanitizeValue(body);
    }
    legacySanitizeToOpenAiWireMessages(messages) {
        return this.sanitizeMessages(messages).map((m) => {
            const role = m.role === 'human' ? 'user'
                : m.role === 'ai' ? 'assistant'
                    : m.role;
            const row = {
                role,
                content: m.content,
            };
            if (m.name)
                row.name = m.name;
            if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
                row.tool_calls = m.toolCalls;
            }
            return row;
        });
    }
    extractToolNameFromCall(call) {
        if (call == null || typeof call !== 'object')
            return null;
        const fn = call.function ?? call.kwargs?.function;
        const fromFn = typeof fn?.name === 'string' ? fn.name.trim() : '';
        if (fromFn)
            return fromFn;
        const direct = typeof call.name === 'string' ? call.name.trim() : '';
        if (direct)
            return direct;
        return null;
    }
    collectRawToolCallsFromMessage(msg) {
        if (!msg || typeof msg !== 'object')
            return [];
        const lists = [
            msg.tool_calls,
            msg.kwargs?.tool_calls,
            msg.additional_kwargs?.tool_calls,
            msg.lc_kwargs?.tool_calls,
        ];
        for (const list of lists) {
            if (Array.isArray(list) && list.length > 0)
                return list;
        }
        return [];
    }
    collectToolsInvokedFromGenerations(generations) {
        const seen = new Set();
        const out = [];
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
    buildOpenAiChatCompletionResponse(output) {
        const generations = Array.isArray(output?.generations) ? output.generations.flat(Infinity) : [];
        const toolsInvoked = this.collectToolsInvokedFromGenerations(generations);
        const choices = generations.map((g, index) => {
            const msg = g?.message;
            const content = this.sanitizeValue(msg?.kwargs?.content ?? msg?.content ?? g?.text ?? '', 0, 6);
            const rawCalls = this.collectRawToolCallsFromMessage(msg);
            const toolCalls = this.sanitizeValue(rawCalls, 0, 8);
            const message = {
                role: 'assistant',
                content,
            };
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                message.tool_calls = toolCalls;
            }
            const labels = rawCalls
                .map((c) => this.extractToolNameFromCall(c))
                .filter((n) => typeof n === 'string' && n.length > 0);
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
        const usage = {};
        if (usageRaw.promptTokens != null)
            usage.prompt_tokens = usageRaw.promptTokens;
        if (usageRaw.completionTokens != null)
            usage.completion_tokens = usageRaw.completionTokens;
        if (usageRaw.totalTokens != null)
            usage.total_tokens = usageRaw.totalTokens;
        const payload = {
            object: 'chat.completion',
            choices,
        };
        if (toolsInvoked.length > 0) {
            payload.tools_invoked = toolsInvoked;
        }
        if (Object.keys(usage).length > 0) {
            payload.usage = this.sanitizeValue(usage, 0, 6);
        }
        return this.sanitizeValue(payload, 0, 10);
    }
    inferMessageRole(message) {
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
            }
            catch {
            }
        }
        const id = message?.id;
        if (Array.isArray(id)) {
            const tail = id[id.length - 1];
            if (typeof tail === 'string') {
                if (tail.includes('System'))
                    return 'system';
                if (tail.includes('Human'))
                    return 'human';
                if (tail.includes('AIMessage'))
                    return 'ai';
                if (tail.includes('Tool'))
                    return 'tool';
            }
        }
        return 'unknown';
    }
    sanitizeMessages(messages) {
        const batches = Array.isArray(messages) ? messages : [messages];
        const firstBatch = Array.isArray(batches[0]) ? batches[0] : batches;
        return firstBatch.map((message) => ({
            role: this.inferMessageRole(message),
            content: this.sanitizeValue(message?.kwargs?.content ?? message?.content ?? ''),
            name: message?.kwargs?.name ?? message?.name,
            toolCalls: this.sanitizeValue(message?.kwargs?.tool_calls
                ?? message?.tool_calls
                ?? message?.additional_kwargs?.tool_calls
                ?? []),
        }));
    }
    extractModelName(serialized, extraParams) {
        return serialized?.kwargs?.modelName
            ?? serialized?.kwargs?.model
            ?? extraParams?.model
            ?? extraParams?.modelName
            ?? extraParams?.invocation_params?.model
            ?? undefined;
    }
    buildWireRequestSummary(modelName, body) {
        const msgList = Array.isArray(body.messages) ? body.messages : [];
        const systemCount = msgList.filter((m) => m?.role === 'system').length;
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
    buildResponseSummary(response) {
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
        }
        else if (toolCalls > 0) {
            summaryParts.push(`${toolCalls} 个 tool call`);
        }
        return summaryParts.join(' · ') || '收到模型响应';
    }
    isSensitiveLogKey(key) {
        const k = key.toLowerCase();
        if (k.includes('apikey') || k.includes('api_key'))
            return true;
        if (k === 'authorization' || k.includes('authorization'))
            return true;
        if (k === 'access_token' || k === 'refresh_token' || k === 'id_token')
            return true;
        if (k === 'token' || k.endsWith('_apitoken'))
            return true;
        return false;
    }
    sanitizeValue(value, depth = 0, maxDepth = 6) {
        if (depth > maxDepth)
            return '[truncated]';
        if (value == null)
            return value;
        if (typeof value === 'string')
            return value;
        if (typeof value === 'number' || typeof value === 'boolean')
            return value;
        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeValue(item, depth + 1, maxDepth));
        }
        if (typeof value === 'object') {
            const result = {};
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
};
exports.LoggerService = LoggerService;
exports.LoggerService = LoggerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], LoggerService);
//# sourceMappingURL=logger.service.js.map