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
const tool_prompt_compat_1 = require("../utils/tool-prompt-compat");
const messages_1 = require("@langchain/core/messages");
function asArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
function pickDisabledExtendedSkillIds(context) {
    if (!context || typeof context !== 'object')
        return undefined;
    const raw = context.disabledExtendedSkillIds;
    if (!Array.isArray(raw) || raw.length === 0)
        return undefined;
    const out = raw
        .filter((x) => typeof x === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (out.length === 0)
        return undefined;
    return [...new Set(out)];
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
        const disabledExtendedSkillIds = userId ? pickDisabledExtendedSkillIds(context) : undefined;
        const sessionId = context?.sessionId || 'default-session';
        const subject = new rxjs_1.Subject();
        const gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
        const apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';
        const llm = (0, llm_merge_1.pickMergedLlm)(context);
        const openAiApiKey = llm.apiKey;
        const modelName = llm.modelName;
        const baseUrl = llm.baseUrl;
        const skillContext = this.skillManager.buildSkillPromptContext();
        const confirmationContext = `
[确认流程] 若工具返回 CONFIRMATION_REQUIRED：先原样把需确认的内容给用户并等待答复；用户同意则再次调用该工具且在参数中加入 "confirmed": true；拒绝则说明已取消，不再执行。
`;
        (0, tool_trace_context_1.runWithToolTraceContext)((event) => subject.next({ data: JSON.stringify(event) }), async () => {
            let fullAssistantResponse = '';
            const seenToolStatuses = new Map();
            try {
                const llmCallbackHandler = this.logger.createLlmCallbackHandler(sessionId, (event) => {
                    subject.next({ data: JSON.stringify(event) });
                });
                const { agent, tools } = await agent_1.AgentFactory.createAgent(gatewayUrl, apiToken, openAiApiKey, {
                    modelName,
                    baseUrl,
                    callbacks: [llmCallbackHandler],
                    ...(disabledExtendedSkillIds ? { disabledExtendedSkillIds } : {}),
                }, this.skillManager, userId);
                const memories = await this.memoryService.searchMemories(instruction, userId, 10);
                console.log(`[Memory] Retrieved ${memories.length} memories for user ${userId}`);
                if (memories.length > 0) {
                    console.log(`[Memory] First memory: ${memories[0]}`);
                }
                const memoryContext = memories.length > 0
                    ? `【记忆摘录】（按当前问题从长期记忆检索）\n${memories.map((m) => `- ${m}`).join('\n')}\n\n与本轮对话相关时可适度引用，不必逐条或全文套用；无关则忽略。用户未问及不要主动罗列。\n\n`
                    : '';
                const toolPromptCompat = (0, tool_prompt_compat_1.isAgentToolPromptCompatEnabled)();
                const toolsPromptSection = toolPromptCompat && tools.length > 0
                    ? `\n\n${(0, tool_prompt_compat_1.formatToolsBlockForSystemPrompt)(tools)}`
                    : '';
                const systemContent = `${skillContext}${confirmationContext}${memoryContext}${toolsPromptSection}`.trimEnd();
                const historyMessages = safeHistory.map((item) => (0, messages_1.coerceMessageLikeToMessage)(item));
                const messages = [
                    ...(systemContent ? [new messages_1.SystemMessage(systemContent)] : []),
                    ...historyMessages,
                    new messages_1.HumanMessage(instruction),
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