const test = require("node:test");
const assert = require("node:assert/strict");
const { DynamicTool } = require("@langchain/core/tools");

const {
  formatToolsBlockForSystemPrompt,
  isAgentToolPromptCompatEnabled,
} = require("../dist/utils/tool-prompt-compat");

test("isAgentToolPromptCompatEnabled is false by default", () => {
  delete process.env.AGENT_TOOL_PROMPT_COMPAT;
  assert.equal(isAgentToolPromptCompatEnabled(), false);
});

test("isAgentToolPromptCompatEnabled respects true-like env", () => {
  process.env.AGENT_TOOL_PROMPT_COMPAT = "true";
  assert.equal(isAgentToolPromptCompatEnabled(), true);
  process.env.AGENT_TOOL_PROMPT_COMPAT = "1";
  assert.equal(isAgentToolPromptCompatEnabled(), true);
  process.env.AGENT_TOOL_PROMPT_COMPAT = "on";
  assert.equal(isAgentToolPromptCompatEnabled(), true);
  delete process.env.AGENT_TOOL_PROMPT_COMPAT;
});

test("formatToolsBlockForSystemPrompt includes header and tool name", () => {
  const tool = new DynamicTool({
    name: "test_compat_tool",
    description: "A test tool",
    func: async () => "ok",
  });
  const block = formatToolsBlockForSystemPrompt([tool]);
  assert.ok(block.includes("【可用工具】"));
  assert.ok(block.includes("兼容模式"));
  assert.ok(block.includes("test_compat_tool"));
  assert.ok(block.includes("A test tool"));
  assert.ok(block.includes("参数 JSON Schema"));
  assert.ok(block.includes("须闭合"));
});

test("formatToolsBlockForSystemPrompt omits extra tools when total cap exceeded", () => {
  const big = "x".repeat(50000);
  const t1 = new DynamicTool({
    name: "a",
    description: big,
    func: async () => "1",
  });
  const t2 = new DynamicTool({
    name: "b_should_often_be_omitted",
    description: "second",
    func: async () => "2",
  });
  const block = formatToolsBlockForSystemPrompt([t1, t2], {
    maxSchemaCharsPerTool: 100000,
    maxTotalBlockChars: 8000,
  });
  assert.ok(block.includes("另有") && block.includes("未列出"));
});
