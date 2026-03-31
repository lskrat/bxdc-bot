const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractXmlToolCallsFromAssistantContent,
} = require("../dist/utils/xml-tool-call-compat");

test("extractXmlToolCallsFromAssistantContent parses user-style block", () => {
  const raw = `<tool_call>
<name>extended_skill_1</name>
<arguments>{"input": "获取当前系统时间"}</arguments>
</tool_call>`;
  const { toolCalls, strippedContent } = extractXmlToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].name, "extended_skill_1");
  assert.deepEqual(toolCalls[0].args, { input: "获取当前系统时间" });
  assert.equal(strippedContent, "");
});

test("extractXmlToolCallsFromAssistantContent leaves prose outside blocks", () => {
  const raw = `我先查一下。\n<tool_call><name>t</name><arguments>{}</arguments></tool_call>`;
  const { toolCalls, strippedContent } = extractXmlToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].name, "t");
  assert.ok(strippedContent.includes("我先查一下"));
});

test("extractXmlToolCallsFromAssistantContent empty when no blocks", () => {
  const { toolCalls } = extractXmlToolCallsFromAssistantContent("hello");
  assert.equal(toolCalls.length, 0);
});
