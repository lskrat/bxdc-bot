"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const agent_1 = require("../agent/agent");
const memory_service_1 = require("../mem/memory.service");
const skill_manager_1 = require("../skills/skill.manager");
const logger_service_1 = require("../utils/logger.service");
const java_skills_1 = require("../tools/java-skills");
const tool_trace_context_1 = require("../tools/tool-trace-context");
const llm_merge_1 = require("../utils/llm-merge");
function asArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
function getChunkMessages(chunk) {
    if (!chunk || typeof chunk !== 'object')
        return [];
    return [
        ...asArray(chunk.agent?.messages),
        ...asArray(chunk.messages),
    ];
}
function inferMessageKind(message) {
    const nestedType = message?.kwargs?.type;
    if (typeof nestedType === 'string')
        return nestedType.toLowerCase();
    const explicitType = message?.type;
    if (typeof explicitType === 'string')
        return explicitType.toLowerCase();
    const nestedRole = message?.kwargs?.role;
    if (typeof nestedRole === 'string')
        return nestedRole.toLowerCase();
    const role = message?.role;
    if (typeof role === 'string')
        return role.toLowerCase();
    const id = message?.id;
    if (typeof id === 'string')
        return id.toLowerCase();
    if (Array.isArray(id))
        return id.join('.').toLowerCase();
    if (message?.content !== undefined)
        return 'aimessagechunk';
    return '';
}
function isAssistantMessage(message) {
    const kind = inferMessageKind(message);
    return kind.includes('assistant') || kind.includes('aimessage');
}
function isToolMessage(message) {
    const kind = inferMessageKind(message);
    return kind.includes('toolmessage') || kind === 'tool';
}
function extractContent(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        const text = content
            .map((part) => {
            if (typeof part === 'string')
                return part;
            if (part && typeof part === 'object' && typeof part.text === 'string') {
                return part.text;
            }
            return '';
        })
            .join('');
        return text || null;
    }
    return null;
}
function getMessageContent(message) {
    return extractContent(message?.kwargs?.content)
        ?? extractContent(message?.content)
        ?? null;
}
function getToolCallEntries(message) {
    return [
        ...asArray(message?.tool_calls),
        ...asArray(message?.kwargs?.tool_calls),
        ...asArray(message?.kwargs?.additional_kwargs?.tool_calls),
        ...asArray(message?.additional_kwargs?.tool_calls),
    ];
}
function normalizeToolName(toolCall, fallback) {
    const name = toolCall?.name
        ?? toolCall?.function?.name
        ?? toolCall?.kwargs?.name
        ?? fallback;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
}
function normalizeToolId(toolCall, fallback) {
    const id = toolCall?.id ?? toolCall?.tool_call_id ?? toolCall?.function?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : fallback;
}
function parseToolArguments(rawArguments) {
    if (typeof rawArguments !== 'string')
        return rawArguments;
    const trimmed = rawArguments.trim();
    if (!trimmed)
        return trimmed;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return trimmed;
    }
}
function extractToolArguments(toolCall) {
    return parseToolArguments(toolCall?.args
        ?? toolCall?.arguments
        ?? toolCall?.function?.arguments
        ?? toolCall?.kwargs?.args
        ?? toolCall?.kwargs?.arguments);
}
function normalizeToolStatus(message) {
    const status = message?.status ?? message?.kwargs?.status;
    if (status === 'error' || status === 'failed')
        return 'failed';
    const content = getMessageContent(message)?.toLowerCase() ?? '';
    if (content.startsWith('error'))
        return 'failed';
    return 'completed';
}
function extractStartedToolCalls(message, messageIndex) {
    if (!isAssistantMessage(message))
        return [];
    return getToolCallEntries(message)
        .map((toolCall, index) => {
        const toolName = normalizeToolName(toolCall);
        if (!toolName)
            return null;
        return {
            toolId: normalizeToolId(toolCall, `${toolName}:${messageIndex}:${index}`),
            toolName,
            status: 'running',
            arguments: (0, tool_trace_context_1.sanitizeToolTraceArguments)(extractToolArguments(toolCall)),
        };
    })
        .filter(Boolean);
}
function extractCompletedToolCall(message) {
    if (!isToolMessage(message))
        return null;
    const toolName = normalizeToolName(message, message?.kwargs?.name);
    if (!toolName)
        return null;
    return {
        toolId: normalizeToolId(message, toolName),
        toolName,
        status: normalizeToolStatus(message),
        arguments: (0, tool_trace_context_1.sanitizeToolTraceArguments)(extractToolArguments(message)),
    };
}
let AgentController = class AgentController {
    memoryService;
    skillManager;
    logger;
    constructor(memoryService, skillManager, logger) {
        this.memoryService = memoryService;
        this.skillManager = skillManager;
        this.logger = logger;
    }
    emitToolEvents(subject, chunk, seenToolStatuses) {
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
    emitToolEvent(subject, toolCall, seenToolStatuses) {
        const previousStatus = seenToolStatuses.get(toolCall.toolId);
        if (previousStatus === toolCall.status)
            return;
        seenToolStatuses.set(toolCall.toolId, toolCall.status);
        const gatewayToolInfo = (0, java_skills_1.describeGatewayExtendedTool)(toolCall.toolName);
        const toolInfo = gatewayToolInfo ?? this.skillManager.describeTool(toolCall.toolName);
        const event = {
            type: 'tool_status',
            toolId: toolCall.toolId,
            toolName: toolCall.toolName,
            displayName: toolInfo.displayName,
            kind: toolInfo.kind,
            status: toolCall.status,
            arguments: toolCall.arguments,
            executionMode: gatewayToolInfo?.executionMode,
            executionLabel: gatewayToolInfo?.executionLabel,
        };
        if (toolCall.status === 'running') {
            (0, tool_trace_context_1.setActiveParentToolId)(toolCall.toolName, toolCall.toolId);
        }
        else {
            (0, tool_trace_context_1.clearActiveParentToolId)(toolCall.toolName, toolCall.toolId);
        }
        subject.next({ data: JSON.stringify(event) });
    }
    runTask(body) {
        const { instruction, context, history } = body;
        const safeHistory = Array.isArray(history) ? history : [];
        const userId = context?.userId;
        const sessionId = context?.sessionId || 'default-session';
        const subject = new rxjs_1.Subject();
        const gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
        const apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';
        const llm = (0, llm_merge_1.pickMergedLlm)(context);
        const openAiApiKey = llm.apiKey;
        const modelName = llm.modelName;
        const baseUrl = llm.baseUrl;
        const skillContext = this.skillManager.buildSkillPromptContext();
        (0, tool_trace_context_1.runWithToolTraceContext)((event) => subject.next({ data: JSON.stringify(event) }), async () => {
            let fullAssistantResponse = '';
            const seenToolStatuses = new Map();
            try {
                const llmCallbackHandler = this.logger.createLlmCallbackHandler(sessionId, (event) => {
                    subject.next({ data: JSON.stringify(event) });
                });
                const agent = await agent_1.AgentFactory.createAgent(gatewayUrl, apiToken, openAiApiKey, { modelName, baseUrl, callbacks: [llmCallbackHandler] }, this.skillManager, userId);
                const memories = await this.memoryService.searchMemories(instruction, userId, 10);
                console.log(`[Memory] Retrieved ${memories.length} memories for user ${userId}`);
                if (memories.length > 0) {
                    console.log(`[Memory] First memory: ${memories[0]}`);
                }
                const memoryContext = memories.length > 0
                    ? `[User Profile & Preferences]\n${memories.map(m => `- ${m}`).join('\n')}\n\nWhen the user asks about their profile or family (e.g. 籍贯、家乡、喜好、昵称、我儿子叫啥、我女儿叫什么、我爱人叫什么), you MUST answer using the relevant information above and state it explicitly (e.g. "你儿子叫yoyo" when they ask 我儿子叫啥). Do not proactively list all facts unless asked.\n\n`
                    : '';
                const fullInstruction = `${skillContext}${memoryContext}User Instruction:\n${instruction}`;
                const validHistory = safeHistory.map(m => {
                    if (m.role === 'assistank' || m.role === 'assistant') {
                        return { ...m, role: 'ai' };
                    }
                    return m;
                }).filter(m => m.role === 'user' || m.role === 'ai' || m.role === 'system');
                const messages = [
                    ...validHistory,
                    { role: 'user', content: fullInstruction }
                ];
                const stream = await agent.stream({ messages });
                for await (const chunk of stream) {
                    subject.next({ data: JSON.stringify(chunk) });
                    this.emitToolEvents(subject, chunk, seenToolStatuses);
                    if (chunk && typeof chunk === 'object') {
                        const lastAssistantMessage = getChunkMessages(chunk)
                            .filter((message) => isAssistantMessage(message))
                            .at(-1);
                        const nextContent = getMessageContent(lastAssistantMessage);
                        if (nextContent) {
                            fullAssistantResponse = nextContent;
                            subject.next({ data: JSON.stringify({ role: 'assistant', content: nextContent }) });
                        }
                    }
                }
                subject.complete();
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
            }
            catch (error) {
                subject.next({ data: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) });
                subject.complete();
            }
        }).catch((error) => {
            subject.next({ data: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) });
            subject.complete();
        });
        return subject.asObservable();
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, common_1.Post)('run'),
    (0, common_1.Sse)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], AgentController.prototype, "runTask", null);
exports.AgentController = AgentController = __decorate([
    (0, common_1.Controller)('agent'),
    __metadata("design:paramtypes", [memory_service_1.MemoryService,
        skill_manager_1.SkillManager,
        logger_service_1.LoggerService])
], AgentController);
//# sourceMappingURL=agent.controller.js.map