import { AsyncLocalStorage } from "node:async_hooks";

export type ToolTraceStatus = "running" | "completed" | "failed";

export interface ToolTraceEvent {
  type: "tool_status";
  toolId: string;
  toolName: string;
  displayName: string;
  kind: "skill" | "tool";
  status: ToolTraceStatus;
  parentToolId?: string;
  parentToolName?: string;
  summary?: string;
  executionMode?: string;
  executionLabel?: string;
}

interface ToolTraceContextValue {
  emit: (event: ToolTraceEvent) => void;
  activeParentToolIds: Map<string, string>;
}

const toolTraceContext = new AsyncLocalStorage<ToolTraceContextValue>();

export async function runWithToolTraceContext<T>(
  emit: (event: ToolTraceEvent) => void,
  work: () => Promise<T>,
): Promise<T> {
  return await toolTraceContext.run({ emit, activeParentToolIds: new Map() }, work);
}

export function emitToolTraceEvent(event: ToolTraceEvent): void {
  toolTraceContext.getStore()?.emit(event);
}

export function setActiveParentToolId(toolName: string, toolId: string): void {
  if (!toolName || !toolId) return;
  toolTraceContext.getStore()?.activeParentToolIds.set(toolName, toolId);
}

export function clearActiveParentToolId(toolName: string, toolId?: string): void {
  const store = toolTraceContext.getStore();
  if (!store || !toolName) return;

  const current = store.activeParentToolIds.get(toolName);
  if (!current) return;
  if (!toolId || current === toolId) {
    store.activeParentToolIds.delete(toolName);
  }
}

export function getActiveParentToolId(toolName: string): string | undefined {
  return toolTraceContext.getStore()?.activeParentToolIds.get(toolName);
}
