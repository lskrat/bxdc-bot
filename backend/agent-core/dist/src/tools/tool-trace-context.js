"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeToolTraceArguments = sanitizeToolTraceArguments;
exports.sanitizeToolResultForTrace = sanitizeToolResultForTrace;
exports.runWithToolTraceContext = runWithToolTraceContext;
exports.emitToolTraceEvent = emitToolTraceEvent;
exports.setActiveParentToolId = setActiveParentToolId;
exports.clearActiveParentToolId = clearActiveParentToolId;
exports.getActiveParentToolId = getActiveParentToolId;
const node_async_hooks_1 = require("node:async_hooks");
const toolTraceContext = new node_async_hooks_1.AsyncLocalStorage();
function sanitizeToolTraceArguments(value, depth = 0) {
    if (depth > 10)
        return "[truncated]";
    if (value == null)
        return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeToolTraceArguments(item, depth + 1));
    }
    if (typeof value === "object") {
        const result = {};
        for (const [key, raw] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey.includes("apikey")
                || normalizedKey.includes("token")
                || normalizedKey.includes("authorization")
                || normalizedKey.includes("password")
                || normalizedKey.includes("privatekey")
                || normalizedKey.includes("secret")
                || normalizedKey.includes("cookie")) {
                result[key] = "[redacted]";
                continue;
            }
            result[key] = sanitizeToolTraceArguments(raw, depth + 1);
        }
        return result;
    }
    return String(value);
}
const MAX_TOOL_RESULT_CHARS = 48_000;
function sanitizeToolResultForTrace(text) {
    const raw = text.length > MAX_TOOL_RESULT_CHARS
        ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated]`
        : text;
    try {
        const parsed = JSON.parse(raw);
        const sanitized = sanitizeToolTraceArguments(parsed);
        if (typeof sanitized === "string")
            return sanitized;
        return JSON.stringify(sanitized, null, 2);
    }
    catch {
        return raw;
    }
}
async function runWithToolTraceContext(emit, work) {
    return await toolTraceContext.run({ emit, activeParentToolIds: new Map() }, work);
}
function emitToolTraceEvent(event) {
    toolTraceContext.getStore()?.emit(event);
}
function setActiveParentToolId(toolName, toolId) {
    if (!toolName || !toolId)
        return;
    toolTraceContext.getStore()?.activeParentToolIds.set(toolName, toolId);
}
function clearActiveParentToolId(toolName, toolId) {
    const store = toolTraceContext.getStore();
    if (!store || !toolName)
        return;
    const current = store.activeParentToolIds.get(toolName);
    if (!current)
        return;
    if (!toolId || current === toolId) {
        store.activeParentToolIds.delete(toolName);
    }
}
function getActiveParentToolId(toolName) {
    return toolTraceContext.getStore()?.activeParentToolIds.get(toolName);
}
//# sourceMappingURL=tool-trace-context.js.map