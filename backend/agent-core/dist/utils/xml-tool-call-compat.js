"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractToolCallsFromJsonValue = extractToolCallsFromJsonValue;
exports.extractFencedJsonToolCallsFromAssistantContent = extractFencedJsonToolCallsFromAssistantContent;
exports.extractPlainTextToolCallsFromAssistantContent = extractPlainTextToolCallsFromAssistantContent;
exports.extractXmlArgumentsPayload = extractXmlArgumentsPayload;
exports.extractXmlToolCallsFromAssistantContent = extractXmlToolCallsFromAssistantContent;
exports.createXmlToolCallPostHook = createXmlToolCallPostHook;
const node_crypto_1 = require("node:crypto");
const messages_1 = require("@langchain/core/messages");
const FENCED_JSON_RE = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
function parseJsonObjectString(raw) {
    const t = raw.trim();
    if (!t)
        return null;
    try {
        const v = JSON.parse(t);
        return v !== null && typeof v === "object" && !Array.isArray(v)
            ? v
            : null;
    }
    catch {
        return null;
    }
}
function normalizeArgumentsField(raw) {
    if (raw == null)
        return {};
    if (typeof raw === "string") {
        const obj = parseJsonObjectString(raw);
        if (obj)
            return obj;
        return { input: raw };
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return raw;
    }
    return {};
}
function extractToolCallsFromJsonValue(parsed) {
    if (parsed == null)
        return [];
    if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => extractToolCallsFromJsonValue(item));
    }
    if (typeof parsed !== "object")
        return [];
    const o = parsed;
    if (Array.isArray(o.tool_calls)) {
        return o.tool_calls.flatMap((item) => extractToolCallsFromJsonValue(item));
    }
    const fn = o.function;
    if (fn && typeof fn === "object" && !Array.isArray(fn)) {
        const f = fn;
        const name = typeof f.name === "string" ? f.name.trim() : "";
        if (!name)
            return [];
        return [{ name, args: normalizeArgumentsField(f.arguments) }];
    }
    const name = (typeof o.name === "string" && o.name.trim()) ||
        (typeof o.tool === "string" && o.tool.trim()) ||
        (typeof o.tool_name === "string" && o.tool_name.trim()) ||
        "";
    if (!name)
        return [];
    const args = "arguments" in o || "args" in o || "parameters" in o
        ? normalizeArgumentsField(o.arguments ?? o.args ?? o.parameters)
        : typeof o.input === "string" || (o.input && typeof o.input === "object")
            ? normalizeArgumentsField(o.input)
            : {};
    return [{ name, args }];
}
function extractFencedJsonToolCallsFromAssistantContent(content) {
    const toolCalls = [];
    if (!content || typeof content !== "string") {
        return { toolCalls, strippedContent: "" };
    }
    FENCED_JSON_RE.lastIndex = 0;
    const strippedContent = content.replace(FENCED_JSON_RE, (full, inner) => {
        const text = inner.trim();
        if (!text)
            return full;
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            return full;
        }
        const extracted = extractToolCallsFromJsonValue(parsed);
        if (extracted.length === 0)
            return full;
        toolCalls.push(...extracted);
        return "";
    }).trim();
    return { toolCalls, strippedContent };
}
function extractPlainTextToolCallsFromAssistantContent(content) {
    const xml = extractXmlToolCallsFromAssistantContent(content);
    const json = extractFencedJsonToolCallsFromAssistantContent(xml.strippedContent);
    return {
        toolCalls: [...xml.toolCalls, ...json.toolCalls],
        strippedContent: json.strippedContent,
    };
}
function extractXmlArgumentsPayload(inner) {
    const openMatch = inner.match(/<\s*arguments\s*>/i);
    if (!openMatch || openMatch.index === undefined)
        return null;
    const start = openMatch.index + openMatch[0].length;
    const afterOpen = inner.slice(start);
    const closedMatch = afterOpen.match(/^([\s\S]*?)<\s*\/\s*arguments\s*>/i);
    if (closedMatch)
        return closedMatch[1].trim();
    return afterOpen.trim() || null;
}
function extractXmlToolCallsFromAssistantContent(content) {
    const toolCalls = [];
    if (!content || typeof content !== "string") {
        return { toolCalls, strippedContent: "" };
    }
    const blockRe = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi;
    const strippedContent = content.replace(blockRe, (_full, inner) => {
        const n = inner.match(/<\s*name\s*>([^<]+)<\/\s*name\s*>/i);
        if (!n?.[1])
            return "";
        const name = n[1].trim();
        let args = {};
        const rawArgs = extractXmlArgumentsPayload(inner);
        if (rawArgs) {
            try {
                args = JSON.parse(rawArgs);
            }
            catch {
                args = { input: rawArgs };
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
        const { toolCalls, strippedContent } = extractPlainTextToolCallsFromAssistantContent(raw);
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