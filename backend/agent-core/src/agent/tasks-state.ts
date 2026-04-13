import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

// NOTE: CONFIRMATION_REQUIRED detection helpers (toolMessageIsConfirmationRequired,
// hasPendingConfirmationRequiredFromTool) have been removed. Confirmation flow is now
// handled at the controller layer via SSE events + REST endpoint (see agent.controller.ts).

/* ── Task status types ── */

export type TaskStatusValue =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface TaskState {
  label: string;
  status: TaskStatusValue;
  updatedAt: string;
}

export type TasksStatusMap = Record<string, TaskState>;

/* ── Extended agent state annotation ── */

export const AgentAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  tasks_status: Annotation<TasksStatusMap>({
    reducer: (current: TasksStatusMap, update: TasksStatusMap) => ({
      ...current,
      ...update,
    }),
    default: () => ({}) as TasksStatusMap,
  }),
});

export type AgentState = typeof AgentAnnotation.State;

/* ── Helpers ── */

const MANAGE_TASKS_TOOL_NAME = "manage_tasks";

/**
 * Scan message history for manage_tasks tool calls and rebuild tasks_status
 * from those calls in chronological order (idempotent).
 */
export function rebuildTasksStatusFromMessages(
  messages: BaseMessage[],
): TasksStatusMap {
  const result: TasksStatusMap = {};

  for (const msg of messages) {
    if (!isAIMessageWithToolCalls(msg)) continue;

    const toolCalls: any[] = (msg as any).tool_calls ?? [];
    for (const tc of toolCalls) {
      if (tc.name !== MANAGE_TASKS_TOOL_NAME) continue;

      const updates: any[] = tc.args?.updates;
      if (!Array.isArray(updates)) continue;

      for (const u of updates) {
        if (typeof u.id !== "string" || typeof u.status !== "string") continue;
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

function isAIMessageWithToolCalls(msg: BaseMessage): boolean {
  const type =
    (msg as any).getType?.() ??
    (msg as any)._getType?.() ??
    (msg as any).type ??
    "";
  return (
    (type === "ai" || type === "AIMessageChunk") &&
    Array.isArray((msg as any).tool_calls) &&
    (msg as any).tool_calls.length > 0
  );
}

/**
 * Build a short textual summary of the current tasks_status for prompt injection.
 */
export function buildTasksSummary(tasks: TasksStatusMap): string {
  const entries = Object.entries(tasks);
  if (entries.length === 0) return "";

  const lines = entries.map(
    ([id, t]) => `- [${t.status}] ${id}: ${t.label}`,
  );

  const completed = entries.filter(([, t]) => t.status === "completed").length;
  const total = entries.length;

  return [
    `[Current Task Status] (${completed}/${total} completed)`,
    ...lines,
    "",
    "Focus on pending/in_progress tasks. Do NOT repeat work for completed tasks unless the user explicitly asks.",
  ].join("\n");
}

/**
 * preModelHook — runs before each LLM invocation.
 *
 * 1. Rebuilds tasks_status from message history (idempotent).
 * 2. Injects a task-status summary into llmInputMessages so the LLM is aware.
 */
export function preModelHook(
  state: AgentState & { llmInputMessages?: BaseMessage[] },
) {
  const freshStatus = rebuildTasksStatusFromMessages(state.messages ?? []);

  const merged: TasksStatusMap = { ...state.tasks_status, ...freshStatus };

  const summary = buildTasksSummary(merged);

  // llmInputMessages may be undefined on the first invocation before the
  // internal message-preparation step populates it; fall back to state.messages.
  const base = Array.isArray(state.llmInputMessages)
    ? state.llmInputMessages
    : (state.messages ?? []);
  const llmInputMessages: BaseMessage[] = [...base];

  if (summary) {
    llmInputMessages.unshift(new SystemMessage(summary));
  }

  return {
    tasks_status: merged,
    llmInputMessages,
  };
}
