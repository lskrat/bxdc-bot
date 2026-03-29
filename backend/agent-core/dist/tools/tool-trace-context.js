"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithToolTraceContext = runWithToolTraceContext;
exports.emitToolTraceEvent = emitToolTraceEvent;
exports.setActiveParentToolId = setActiveParentToolId;
exports.clearActiveParentToolId = clearActiveParentToolId;
exports.getActiveParentToolId = getActiveParentToolId;
const node_async_hooks_1 = require("node:async_hooks");
const toolTraceContext = new node_async_hooks_1.AsyncLocalStorage();
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