import { randomUUID } from "node:crypto";
import {
  AIMessage,
  ToolMessage,
  isAIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Extract `<tool_call><name>...</name><arguments>...</arguments></tool_call>` blocks
 * from model plain-text content (prompt-only / compat gateways that do not return tool_calls).
 */
export function extractXmlToolCallsFromAssistantContent(content: string): {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  strippedContent: string;
} {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (!content || typeof content !== "string") {
    return { toolCalls, strippedContent: "" };
  }
  const blockRe = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi;
  const strippedContent = content.replace(blockRe, (_full, inner: string) => {
    const n = inner.match(/<\s*name\s*>([^<]+)<\/\s*name\s*>/i);
    const a = inner.match(/<\s*arguments\s*>([\s\S]*?)<\/\s*arguments\s*>/i);
    if (!n?.[1]) return "";
    const name = n[1].trim();
    let args: Record<string, unknown> = {};
    if (a?.[1]) {
      const raw = a[1].trim();
      try {
        args = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        args = { input: raw };
      }
    }
    toolCalls.push({ name, args });
    return "";
  }).trim();
  return { toolCalls, strippedContent };
}

function getAssistantStringContent(msg: AIMessage): string {
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) =>
        typeof p === "object" && p !== null && "text" in p ? String((p as { text: unknown }).text) : ""
      )
      .join("");
  }
  return "";
}

/**
 * When AGENT_TOOL_PROMPT_COMPAT is on, the graph uses `tools: []` so the API omits tools.
 * Models may still emit XML tool calls in `content`. This hook parses them, runs matching
 * tools, appends ToolMessages, and rewrites the last AIMessage so the graph routes back to
 * the agent (last message = tool) without using the empty ToolNode.
 */
export function createXmlToolCallPostHook(tools: StructuredToolInterface[]) {
  return async (
    state: { messages: BaseMessage[] },
    config?: LangGraphRunnableConfig
  ): Promise<{ messages: BaseMessage[] } | Record<string, never>> => {
    const messages = state.messages;
    if (!messages?.length) return {};
    const last = messages[messages.length - 1];
    if (!isAIMessage(last)) return {};
    if (last.tool_calls?.length) return {};

    const raw = getAssistantStringContent(last);
    const { toolCalls, strippedContent } = extractXmlToolCallsFromAssistantContent(raw);
    if (toolCalls.length === 0) return {};

    const lcToolCalls = toolCalls.map((tc) => ({
      id: randomUUID(),
      name: tc.name,
      args: tc.args,
      type: "tool_call" as const,
    }));

    const patchedAi = new AIMessage({
      content: strippedContent,
      tool_calls: lcToolCalls,
      id: last.id,
    });

    const toolMessages: ToolMessage[] = [];
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]!;
      const call = lcToolCalls[i]!;
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool) {
        toolMessages.push(
          new ToolMessage({
            content: `Error: Tool "${tc.name}" not found.`,
            tool_call_id: call.id,
            name: tc.name,
          })
        );
        continue;
      }
      try {
        const output = await tool.invoke(
          { name: call.name, args: call.args, id: call.id, type: "tool_call" as const },
          config
        );
        const text = typeof output === "string" ? output : JSON.stringify(output);
        toolMessages.push(
          new ToolMessage({
            content: text,
            tool_call_id: call.id,
            name: tc.name,
          })
        );
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        toolMessages.push(
          new ToolMessage({
            content: `Error: ${err}\n Please fix your mistakes.`,
            tool_call_id: call.id,
            name: tc.name,
          })
        );
      }
    }

    return { messages: [patchedAi, ...toolMessages] };
  };
}
