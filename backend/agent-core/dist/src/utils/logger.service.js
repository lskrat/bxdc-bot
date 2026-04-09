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
                const requestEntry = this.appendLlmEntry({
                    sessionId,
                    invocationId: String(runId),
                    direction: 'request',
                    summary: this.buildRequestSummary(modelName, messages),
                    modelName,
                    request: {
                        modelName,
                        params: this.sanitizeInvocationParams(extraParams),
                        messages: this.sanitizeMessages(messages),
                    },
                });
                emit({ type: 'llm_log', entry: requestEntry });
            },
            handleLLMEnd: async (output, runId) => {
                const invocationId = String(runId);
                const modelName = runMetadata.get(invocationId)?.modelName;
                const responsePayload = this.sanitizeLlmOutput(output);
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
    sanitizeInvocationParams(extraParams) {
        return this.sanitizeValue(extraParams);
    }
    normalizeLangChainRoleToOpenAi(role) {
        if (typeof role !== 'string')
            return 'unknown';
        const r = role.toLowerCase().trim();
        if (r === 'human' || r === 'humanmessage')
            return 'user';
        if (r === 'ai' || r === 'aimessage' || r === 'aimessagechunk')
            return 'assistant';
        if (r === 'system' || r === 'systemmessage')
            return 'system';
        if (r === 'tool' || r === 'toolmessage')
            return 'tool';
        if (r === 'user' || r === 'assistant' || r === 'system' || r === 'tool')
            return r;
        return role;
    }
    sanitizeMessages(messages) {
        const batches = Array.isArray(messages) ? messages : [messages];
        const firstBatch = Array.isArray(batches[0]) ? batches[0] : batches;
        return firstBatch.map((message) => ({
            role: this.normalizeLangChainRoleToOpenAi(message?.kwargs?.role ?? message?.role ?? message?.type ?? 'unknown'),
            content: this.sanitizeValue(message?.kwargs?.content ?? message?.content ?? ''),
            name: message?.kwargs?.name ?? message?.name,
            toolCalls: this.sanitizeValue(message?.kwargs?.tool_calls
                ?? message?.tool_calls
                ?? message?.additional_kwargs?.tool_calls
                ?? []),
        }));
    }
    sanitizeLlmOutput(output) {
        const generations = Array.isArray(output?.generations) ? output.generations : [];
        const flattened = generations.flat();
        const normalizedGenerations = flattened.map((generation) => {
            const message = generation?.message;
            const content = message?.kwargs?.content ?? message?.content ?? generation?.text ?? '';
            return {
                role: this.normalizeLangChainRoleToOpenAi(message?.kwargs?.role ?? message?.role ?? message?.type ?? 'assistant'),
                text: typeof generation?.text === 'string' ? generation.text : undefined,
                content: this.sanitizeValue(content),
                toolCalls: this.sanitizeValue(message?.kwargs?.tool_calls
                    ?? message?.tool_calls
                    ?? message?.additional_kwargs?.tool_calls
                    ?? []),
                generationInfo: this.sanitizeValue(generation?.generationInfo ?? generation?.generation_info),
            };
        });
        return {
            generations: normalizedGenerations,
            llmOutput: this.sanitizeValue(output?.llmOutput ?? output?.llm_output ?? {}),
        };
    }
    extractModelName(serialized, extraParams) {
        return serialized?.kwargs?.modelName
            ?? serialized?.kwargs?.model
            ?? extraParams?.model
            ?? extraParams?.modelName
            ?? extraParams?.invocation_params?.model
            ?? undefined;
    }
    buildRequestSummary(modelName, messages) {
        const sanitizedMessages = this.sanitizeMessages(messages);
        const parts = [
            modelName ? `模型 ${modelName}` : '模型请求',
            `${sanitizedMessages.length} 条消息`,
        ];
        return parts.join(' · ');
    }
    buildResponseSummary(response) {
        const generations = Array.isArray(response.generations) ? response.generations : [];
        const firstGeneration = generations[0];
        const text = typeof firstGeneration?.content === 'string'
            ? firstGeneration.content
            : typeof firstGeneration?.text === 'string'
                ? firstGeneration.text
                : '';
        const toolCalls = Array.isArray(firstGeneration?.toolCalls) ? firstGeneration.toolCalls.length : 0;
        const summaryParts = [];
        if (text) {
            summaryParts.push(`返回 ${text.length > 24 ? `${text.slice(0, 24)}...` : text}`);
        }
        if (toolCalls > 0) {
            summaryParts.push(`${toolCalls} 个 tool call`);
        }
        return summaryParts.join(' · ') || '收到模型响应';
    }
    sanitizeValue(value, depth = 0) {
        if (depth > 8)
            return '[truncated]';
        if (value == null)
            return value;
        if (typeof value === 'string')
            return value;
        if (typeof value === 'number' || typeof value === 'boolean')
            return value;
        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeValue(item, depth + 1));
        }
        if (typeof value === 'object') {
            const result = {};
            for (const [key, raw] of Object.entries(value)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('apikey') || lowerKey.includes('token') || lowerKey.includes('authorization')) {
                    result[key] = '[redacted]';
                    continue;
                }
                result[key] = this.sanitizeValue(raw, depth + 1);
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