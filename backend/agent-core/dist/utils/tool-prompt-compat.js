"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAgentToolPromptCompatEnabled = isAgentToolPromptCompatEnabled;
exports.formatToolsBlockForSystemPrompt = formatToolsBlockForSystemPrompt;
const json_schema_1 = require("@langchain/core/utils/json_schema");
const DEFAULT_MAX_SCHEMA_CHARS_PER_TOOL = 6000;
const DEFAULT_MAX_TOTAL_BLOCK_CHARS = 48000;
function isAgentToolPromptCompatEnabled() {
    const v = process.env.AGENT_TOOL_PROMPT_COMPAT?.trim().toLowerCase();
    if (!v)
        return false;
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
function truncateText(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n…(truncated, ${text.length - maxChars} chars omitted)`;
}
function schemaToJsonString(schema) {
    if (schema == null)
        return "{}";
    try {
        const json = (0, json_schema_1.toJsonSchema)(schema);
        return JSON.stringify(json);
    }
    catch {
        return "{}";
    }
}
function formatToolsBlockForSystemPrompt(tools, options) {
    const maxSchema = options?.maxSchemaCharsPerTool ?? DEFAULT_MAX_SCHEMA_CHARS_PER_TOOL;
    const maxTotal = options?.maxTotalBlockChars ?? DEFAULT_MAX_TOTAL_BLOCK_CHARS;
    const header = [
        "【可用工具】",
        "当前请求未在 Chat Completions 的 tools 字段中重复下发定义（兼容模式）；请仅依据下文名称与参数 schema，通过协议规定的 tool/function 调用发起执行，不要仅凭文本臆造调用结果。",
        "",
    ].join("\n");
    const parts = [header];
    let totalLen = header.length;
    let omitted = 0;
    for (const tool of tools) {
        if (!tool || typeof tool !== "object")
            continue;
        const name = typeof tool.name === "string" ? tool.name : "";
        const description = typeof tool.description === "string" ? tool.description : "";
        const schemaRaw = schemaToJsonString(tool.schema);
        const schemaStr = truncateText(schemaRaw, maxSchema);
        const block = `### ${name}\n**说明：** ${description}\n**参数 JSON Schema：**\n\`\`\`json\n${schemaStr}\n\`\`\`\n`;
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
//# sourceMappingURL=tool-prompt-compat.js.map