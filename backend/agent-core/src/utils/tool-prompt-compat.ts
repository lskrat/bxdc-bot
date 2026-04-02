import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { StructuredToolInterface } from "@langchain/core/tools";

const DEFAULT_MAX_SCHEMA_CHARS_PER_TOOL = 6000;
const DEFAULT_MAX_TOTAL_BLOCK_CHARS = 48000;

/** When true, append a 【可用工具】 block and omit API `tools` (prompt + post-hook execution). */
export function isAgentToolPromptCompatEnabled(): boolean {
  const v = process.env.AGENT_TOOL_PROMPT_COMPAT?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Injected into tool results when a disk SKILL is loaded while compat mode is on.
 * SKILL authors sometimes document API-native or other formats; the post-hook only understands
 * XML `<tool_call>` and fenced ```json (see `extractPlainTextToolCallsFromAssistantContent`).
 */
export function getCompatToolInvocationReminderForLoadedSkill(): string {
  return [
    "【兼容模式 · 工具调用（权威格式）】",
    "若本 SKILL 正文描述的调用方式（如 OpenAI function_call、裸 JSON、纯自然语言等）与下文不一致，**以下文为准**；否则解析器无法执行。",
    "",
    "本环境不向模型 API 传 `tools`，也不使用响应里的原生 `tool_calls` 字段；**必须把调用写进助手正文**：",
    "",
    "1）XML（推荐，须完整闭合）：",
    '<tool_call><name>工具名</name><arguments>{"字段":"值"}</arguments></tool_call>',
    "勿漏 `</arguments></tool_call>`；`arguments` 内为合法 JSON。",
    "",
    '2）或单独一段 Markdown 代码块：以 ```json 开头、``` 结尾，内容为 {"name":"工具名","arguments":{...}}。',
    "",
    "参数形状须与系统消息【可用工具】中该工具的「参数 JSON Schema」一致。",
    "",
  ].join("\n");
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…(truncated, ${text.length - maxChars} chars omitted)`;
}

function schemaToJsonString(schema: unknown): string {
  if (schema == null) return "{}";
  try {
    const json = toJsonSchema(schema as Parameters<typeof toJsonSchema>[0]);
    return JSON.stringify(json);
  } catch {
    return "{}";
  }
}

/**
 * Serializes LangChain tools into a system-prompt section for gateways that ignore API `tools`.
 */
export function formatToolsBlockForSystemPrompt(
  tools: StructuredToolInterface[],
  options?: { maxSchemaCharsPerTool?: number; maxTotalBlockChars?: number },
): string {
  const maxSchema = options?.maxSchemaCharsPerTool ?? DEFAULT_MAX_SCHEMA_CHARS_PER_TOOL;
  const maxTotal = options?.maxTotalBlockChars ?? DEFAULT_MAX_TOTAL_BLOCK_CHARS;

  const header = [
    "【可用工具】（兼容模式）",
    "本请求 tools 字段为空；用正文中的 XML 或 ```json 片段调用，勿编造工具结果。可单独成段。",
    "",
    "**格式一（推荐）XML，须闭合：**",
    "<tool_call><name>工具名</name><arguments>{\"字段\":\"值\"}</arguments></tool_call>",
    "勿漏 `</arguments></tool_call>`；arguments 内 JSON 一次写全。",
    "",
    "**参数与各工具下「参数 JSON Schema」一致。**",
    "请直接按照 Schema 输出 JSON，**不要**将参数包装在额外的嵌套字符串中。",
    "例如：<arguments>{\"serverName\":\"测试服务器\"}</arguments>",
    "",
    "**格式二 Markdown：**",
    "```json",
    "{\"name\":\"skill_hello_world\",\"arguments\":{\"input\":\"用户要验证 skill 是否可用\"}}",
    "```",
    "顶层须含 **name**（与 ### 标题一致）与 **arguments** 对象。",
    "",
  ].join("\n");

  const parts: string[] = [header];
  let totalLen = header.length;
  let omitted = 0;

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const name = typeof tool.name === "string" ? tool.name : "";
    const description = typeof tool.description === "string" ? tool.description : "";
    const schemaRaw = schemaToJsonString((tool as { schema?: unknown }).schema);
    const schemaStr = truncateText(schemaRaw, maxSchema);
    const block =
      `### ${name}\n**说明：** ${description}\n**参数 JSON Schema：**\n\`\`\`json\n${schemaStr}\n\`\`\`\n`;
    const nextLen = totalLen + block.length + 1;
    if (nextLen > maxTotal) {
      omitted += 1;
      continue;
    }
    parts.push(block);
    totalLen = nextLen;
  }

  if (omitted > 0) {
    parts.push(`\n…(另有 ${omitted} 个工具因总长度上限未列出)\n`);
  }

  return parts.join("\n").trimEnd();
}
