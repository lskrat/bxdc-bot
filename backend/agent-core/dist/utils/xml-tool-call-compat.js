"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractXmlToolCallsFromAssistantContent = extractXmlToolCallsFromAssistantContent;
exports.createXmlToolCallPostHook = createXmlToolCallPostHook;
const node_crypto_1 = require("node:crypto");
const messages_1 = require("@langchain/core/messages");
function extractXmlToolCallsFromAssistantContent(content) {
    const toolCalls = [];
    if (!content || typeof content !== "string") {
        return { toolCalls, strippedContent: "" };
    }
    const blockRe = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi;
    const strippedContent = content.replace(blockRe, (_full, inner) => {
        const n = inner.match(/<\s*name\s*>([^<]+)<\/\s*name\s*>/i);
        const a = inner.match(/<\s*arguments\s*>([\s\S]*?)<\/\s*arguments\s*>/i);
        if (!n?.[1])
            return "";
        const name = n[1].trim();
        let args = {};
        if (a?.[1]) {
            const raw = a[1].trim();
            try {
                args = JSON.parse(raw);
            }
            catch {
                args = { input: raw };
            }
        }
        toolCalls.push({ name, args });
        return "";
    }).trim();
    return { toolCalls, strippedContent };
}
function getAssistantStringContent(msg) {
    const c = msg.content;
    if (typeof c === "string")
        return c;
    if (Array.isArray(c)) {
        return c
            .map((p) => typeof p === "object" && p !== null && "text" in p ? String(p.text) : "")
            .join("");
    }
    return "";
}
function createXmlToolCallPostHook(tools) {
    return async (state, config) => {
        const messages = state.messages;
        if (!messages?.length)
            return {};
        const last = messages[messages.length - 1];
        if (!(0, messages_1.isAIMessage)(last))
            return {};
        if (last.tool_calls?.length)
            return {};
        const raw = getAssistantStringContent(last);
        const { toolCalls, strippedContent } = extractXmlToolCallsFromAssistantContent(raw);
        if (toolCalls.length === 0)
            return {};
        const lcToolCalls = toolCalls.map((tc) => ({
            id: (0, node_crypto_1.randomUUID)(),
            name: tc.name,
            args: tc.args,
            type: "tool_call",
        }));
        const patchedAi = new messages_1.AIMessage({
            content: strippedContent,
            tool_calls: lcToolCalls,
            id: last.id,
        });
        const toolMessages = [];
        for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const call = lcToolCalls[i];
            const tool = tools.find((t) => t.name === tc.name);
            if (!tool) {
                toolMessages.push(new messages_1.ToolMessage({
                    content: `Error: Tool "${tc.name}" not found.`,
                    tool_call_id: call.id,
                    name: tc.name,
                }));
                continue;
            }
            try {
                const output = await tool.invoke({ name: call.name, args: call.args, id: call.id, type: "tool_call" }, config);
                const text = typeof output === "string" ? output : JSON.stringify(output);
                toolMessages.push(new messages_1.ToolMessage({
                    content: text,
                    tool_call_id: call.id,
                    name: tc.name,
                }));
            }
            catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                toolMessages.push(new messages_1.ToolMessage({
                    content: `Error: ${err}\n Please fix your mistakes.`,
                    tool_call_id: call.id,
                    name: tc.name,
                }));
            }
        }
        return { messages: [patchedAi, ...toolMessages] };
    };
}
//# sourceMappingURL=xml-tool-call-compat.js.map