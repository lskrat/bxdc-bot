import { randomUUID } from "node:crypto";
import {
  AIMessage,
  ToolMessage,
  isAIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export type PlainTextToolCall = { name: string; args: Record<string, unknown> };

const FENCED_JSON_RE = /```(?:json)?\s*\n?([\s\S]*?)```/gi;

function parseJsonObjectString(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as unknown;
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeArgumentsField(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const obj = parseJsonObjectString(raw);
    if (obj) return obj;
    return { input: raw };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Interprets one JSON value (object) as zero or more logical tool calls
 * (OpenAI-style, or { name, arguments }).
 */
export function extractToolCallsFromJsonValue(parsed: unknown): PlainTextToolCall[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => extractToolCallsFromJsonValue(item));
  }
  if (typeof parsed !== "object") return [];

  const o = parsed as Record<string, unknown>;

  if (Array.isArray(o.tool_calls)) {
    return o.tool_calls.flatMap((item) => extractToolCallsFromJsonValue(item));
  }

  const fn = o.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn)) {
    const f = fn as Record<string, unknown>;
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!name) return [];
    return [{ name, args: normalizeArgumentsField(f.arguments) }];
  }

  const name =
    (typeof o.name === "string" && o.name.trim()) ||
    (typeof o.tool === "string" && o.tool.trim()) ||
    (typeof o.tool_name === "string" && o.tool_name.trim()) ||
    "";
  if (!name) return [];

  const args =
    "arguments" in o || "args" in o || "parameters" in o
      ? normalizeArgumentsField(o.arguments ?? o.args ?? o.parameters)
      : typeof o.input === "string" || (o.input && typeof o.input === "object")
        ? normalizeArgumentsField(o.input)
        : {};

  return [{ name, args }];
}

/**
 * Extract ```json ... ``` (or ``` ... ```) blocks that encode tool calls; removes consumed blocks.
 */
export function extractFencedJsonToolCallsFromAssistantContent(content: string): {
  toolCalls: PlainTextToolCall[];
  strippedContent: string;
} {
  const toolCalls: PlainTextToolCall[] = [];
  if (!content || typeof content !== "string") {
    return { toolCalls, strippedContent: "" };
  }
  FENCED_JSON_RE.lastIndex = 0;
  const strippedContent = content.replace(FENCED_JSON_RE, (full: string, inner: string) => {
    const text = inner.trim();
    if (!text) return full;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return full;
    }
    const extracted = extractToolCallsFromJsonValue(parsed);
    if (extracted.length === 0) return full;
    toolCalls.push(...extracted);
    return "";
  }).trim();
  return { toolCalls, strippedContent };
}

/**
 * XML blocks first, then fenced JSON on the remainder (compat: models without native tool_calls).
 */
export function extractPlainTextToolCallsFromAssistantContent(content: string): {
  toolCalls: PlainTextToolCall[];
  strippedContent: string;
} {
  const xml = extractXmlToolCallsFromAssistantContent(content);
  const json = extractFencedJsonToolCallsFromAssistantContent(xml.strippedContent);
  return {
    toolCalls: [...xml.toolCalls, ...json.toolCalls],
    strippedContent: json.strippedContent,
  };
}

/**
 * Payload inside `<arguments>...</arguments>`, or remainder of block if `</arguments>` is missing (model error).
 */
export function extractXmlArgumentsPayload(inner: string): string | null {
  const openMatch = inner.match(/<\s*arguments\s*>/i);
  if (!openMatch || openMatch.index === undefined) return null;
  const start = openMatch.index + openMatch[0].length;
  const afterOpen = inner.slice(start);
  const closedMatch = afterOpen.match(/^([\s\S]*?)<\s*\/\s*arguments\s*>/i);
  if (closedMatch) return closedMatch[1]!.trim();
  return afterOpen.trim() || null;
}

/**
 * Extract `<tool_call><name>...</name><arguments>...</arguments></tool_call>` blocks
 * from model plain-text content (prompt-only / compat gateways that do not return tool_calls).
 */
export function extractXmlToolCallsFromAssistantContent(content: string): {
  toolCalls: PlainTextToolCall[];
  strippedContent: string;
} {
  const toolCalls: PlainTextToolCall[] = [];
  if (!content || typeof content !== "string") {
    return { toolCalls, strippedContent: "" };
  }
  const blockRe = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi;
  const strippedContent = content.replace(blockRe, (_full, inner: string) => {
    const n = inner.match(/<\s*name\s*>([^<]+)<\/\s*name\s*>/i);
    if (!n?.[1]) return "";
    const name = n[1].trim();
    let args: Record<string, unknown> = {};
    const rawArgs = extractXmlArgumentsPayload(inner);
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = { input: rawArgs };
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
 * Models may emit XML `<tool_call>` and/or fenced JSON in `content`. This hook parses them,
 * runs matching tools, appends ToolMessages, and rewrites the last AIMessage so the graph
 * routes back to the agent without using the empty ToolNode.
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
    const { toolCalls, strippedContent } = extractPlainTextToolCallsFromAssistantContent(raw);
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
