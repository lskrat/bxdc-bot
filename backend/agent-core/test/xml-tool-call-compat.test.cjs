const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractXmlToolCallsFromAssistantContent,
  extractFencedJsonToolCallsFromAssistantContent,
  extractPlainTextToolCallsFromAssistantContent,
  extractToolCallsFromJsonValue,
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

test("extractXmlToolCallsFromAssistantContent tolerates missing closing arguments tag", () => {
  const raw = `<tool_call><name>extended_check_server_ports</name><arguments>{"input": "x"}
</tool_call>`;
  const { toolCalls, strippedContent } = extractXmlToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].name, "extended_check_server_ports");
  assert.deepEqual(toolCalls[0].args, { input: "x" });
  assert.equal(strippedContent, "");
});

test("extractFencedJsonToolCallsFromAssistantContent parses name + arguments object", () => {
  const raw = `好的。\n\`\`\`json\n{"name":"skill_hello_world","arguments":{"input":"verify"}}\n\`\`\``;
  const { toolCalls, strippedContent } = extractFencedJsonToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].name, "skill_hello_world");
  assert.deepEqual(toolCalls[0].args, { input: "verify" });
  assert.ok(strippedContent.includes("好的"));
  assert.ok(!strippedContent.includes("skill_hello_world"));
});

test("extractFencedJsonToolCallsFromAssistantContent leaves block when only input (no name)", () => {
  const raw = `\`\`\`json\n{"input":"x"}\n\`\`\``;
  const { toolCalls, strippedContent } = extractFencedJsonToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 0);
  assert.ok(strippedContent.includes("input"));
});

test("extractPlainTextToolCallsFromAssistantContent merges xml then json", () => {
  const raw = `<tool_call><name>a</name><arguments>{}</arguments></tool_call>\n\`\`\`json\n{"name":"b","arguments":{}}\n\`\`\``;
  const { toolCalls } = extractPlainTextToolCallsFromAssistantContent(raw);
  assert.equal(toolCalls.length, 2);
  assert.equal(toolCalls[0].name, "a");
  assert.equal(toolCalls[1].name, "b");
});

test("extractToolCallsFromJsonValue handles OpenAI-style tool_calls array", () => {
  const calls = extractToolCallsFromJsonValue({
    tool_calls: [
      {
        type: "function",
        function: { name: "skill_x", arguments: JSON.stringify({ input: "why" }) },
      },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "skill_x");
  assert.deepEqual(calls[0].args, { input: "why" });
});
