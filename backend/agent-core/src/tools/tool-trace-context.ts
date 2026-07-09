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
  arguments?: unknown;
  /** Tool function return body (e.g. JSON string from gateway); sanitized and length-capped. */
  result?: string;
  executionMode?: string;
  executionLabel?: string;
  role?: "sub_agent" | "main_agent";
}

/** Think block start event — frontend creates a collapsible think section for sub-agent output. */
export interface ThinkStartEvent {
  type: "think_start";
  thinkId: string;
  parentToolId: string;
  parentToolName: string;
  displayName: string;
}

/** Think block text event — streams sub-agent AI text into the think section. */
export interface AgentTextEvent {
  type: "agent_text";
  thinkId: string;
  role: "sub_agent" | "main_agent";
  content: string;
  /** If true, replace the entire think block content; otherwise append (default). */
  replace?: boolean;
}

/** Think block end event — marks sub-agent execution complete. */
export interface ThinkEndEvent {
  type: "think_end";
  thinkId: string;
  parentToolId: string;
  status: "completed" | "failed" | "retry";
}

/** Union type for all SSE events emitted through the trace context. */
export type SseEvent = ToolTraceEvent | ThinkStartEvent | AgentTextEvent | ThinkEndEvent;

interface ToolTraceContextValue {
  emit: (event: SseEvent) => void;
  activeParentToolIds: Map<string, string>;
  activeThinkIds: Map<string, string>;
  /** 并行 tool 调用的 invocationId FIFO 队列，按 toolName 分组 */
  pendingInvocationIds: Map<string, string[]>;
}

const toolTraceContext = new AsyncLocalStorage<ToolTraceContextValue>();

export function sanitizeToolTraceArguments(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolTraceArguments(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("apikey")
        || normalizedKey.includes("token")
        || normalizedKey.includes("authorization")
        || normalizedKey.includes("password")
        || normalizedKey.includes("privatekey")
        || normalizedKey.includes("secret")
        || normalizedKey.includes("cookie")
      ) {
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

/**
 * Sanitize and cap tool output for SSE / UI (may be JSON or plain text).
 */
export function sanitizeToolResultForTrace(text: string): string {
  const raw =
    text.length > MAX_TOOL_RESULT_CHARS
      ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated]`
      : text;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeToolTraceArguments(parsed);
    if (typeof sanitized === "string") return sanitized;
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return raw;
  }
}

export async function runWithToolTraceContext<T>(
  emit: (event: SseEvent) => void,
  work: () => Promise<T>,
): Promise<T> {
  return await toolTraceContext.run({ emit, activeParentToolIds: new Map(), activeThinkIds: new Map(), pendingInvocationIds: new Map() }, work);
}

export function emitToolTraceEvent(event: ToolTraceEvent): void {
  toolTraceContext.getStore()?.emit(event);
}

/** Emit a think_start event to signal the frontend to create a collapsible think block. */
export function emitThinkStartEvent(event: ThinkStartEvent): void {
  toolTraceContext.getStore()?.emit(event);
}

/** Emit a sub-agent text chunk into the active think block. */
export function emitAgentTextEvent(event: AgentTextEvent): void {
  toolTraceContext.getStore()?.emit(event);
}

/** Emit a think_end event to signal the think block is complete. */
export function emitThinkEndEvent(event: ThinkEndEvent): void {
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

export function setActiveThinkId(parentToolId: string, thinkId: string): void {
  if (!parentToolId || !thinkId) return;
  toolTraceContext.getStore()?.activeThinkIds.set(parentToolId, thinkId);
}

export function getActiveThinkId(parentToolId: string): string | undefined {
  return toolTraceContext.getStore()?.activeThinkIds.get(parentToolId);
}

export function clearActiveThinkId(parentToolId: string): void {
  toolTraceContext.getStore()?.activeThinkIds.delete(parentToolId);
}

/**
 * 将 invocationId 推入 FIFO 队列，供控制器消费后替换 tool_status 的 toolId。
 * 并行调用各自 push，控制器按序 consume，精准匹配。
 */
export function pushInvocationId(toolName: string, invocationId: string): void {
  if (!toolName || !invocationId) return;
  const store = toolTraceContext.getStore();
  if (!store) return;
  const queue = store.pendingInvocationIds.get(toolName);
  if (queue) {
    queue.push(invocationId);
  } else {
    store.pendingInvocationIds.set(toolName, [invocationId]);
  }
}

/**
 * 从 FIFO 队列消费一个 invocationId（先进先出）。
 * 控制器在 on_tool_start 时调用，拿到 func 中对应的 invocationId。
 */
export function consumeInvocationId(toolName: string): string | undefined {
  if (!toolName) return undefined;
  const store = toolTraceContext.getStore();
  if (!store) return undefined;
  const queue = store.pendingInvocationIds.get(toolName);
  if (!queue || queue.length === 0) return undefined;
  return queue.shift();
}
