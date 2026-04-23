"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentAnnotation = void 0;
exports.rebuildTasksStatusFromMessages = rebuildTasksStatusFromMessages;
exports.buildTasksSummary = buildTasksSummary;
exports.preModelHook = preModelHook;
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const prompts_1 = require("../prompts");
exports.AgentAnnotation = langgraph_1.Annotation.Root({
    ...langgraph_1.MessagesAnnotation.spec,
    tasks_status: (0, langgraph_1.Annotation)({
        reducer: (current, update) => ({
            ...current,
            ...update,
        }),
        default: () => ({}),
    }),
});
const MANAGE_TASKS_TOOL_NAME = "manage_tasks";
function rebuildTasksStatusFromMessages(messages) {
    const result = {};
    for (const msg of messages) {
        if (!isAIMessageWithToolCalls(msg))
            continue;
        const toolCalls = msg.tool_calls ?? [];
        for (const tc of toolCalls) {
            if (tc.name !== MANAGE_TASKS_TOOL_NAME)
                continue;
            const updates = tc.args?.updates;
            if (!Array.isArray(updates))
                continue;
            for (const u of updates) {
                if (typeof u.id !== "string" || typeof u.status !== "string")
                    continue;
                result[u.id] = {
                    label: u.label ?? result[u.id]?.label ?? "",
                    status: u.status,
                    updatedAt: u.updatedAt ?? new Date().toISOString(),
                };
            }
        }
    }
    return result;
}
function isAIMessageWithToolCalls(msg) {
    const type = msg.getType?.() ??
        msg._getType?.() ??
        msg.type ??
        "";
    return ((type === "ai" || type === "AIMessageChunk") &&
        Array.isArray(msg.tool_calls) &&
        msg.tool_calls.length > 0);
}
function buildTasksSummary(tasks) {
    return prompts_1.Prompts.buildTasksSummary(tasks);
}
function preModelHook(state) {
    const freshStatus = rebuildTasksStatusFromMessages(state.messages ?? []);
    const merged = { ...state.tasks_status, ...freshStatus };
    const summary = buildTasksSummary(merged);
    const base = Array.isArray(state.llmInputMessages)
        ? state.llmInputMessages
        : (state.messages ?? []);
    const llmInputMessages = [...base];
    if (summary) {
        llmInputMessages.unshift(new messages_1.SystemMessage(summary));
    }
    return {
        tasks_status: merged,
        llmInputMessages,
    };
}
//# sourceMappingURL=tasks-state.js.map