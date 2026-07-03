/**
 * Tests for llm-request-role-normalize.ts
 *
 * Covers:
 *  1. SSE normalize write-back bug fix (rewrite data line with normalized chunk)
 *  2. qwen3.6 reasoning merge (delta.reasoning → delta.content)
 *  3. choices:[] drop (智谱 GLM 流末尾 usage block)
 *  4. [DONE] passthrough
 *  5. non-JSON data line passthrough
 *  6. non-streaming JSON response normalization (stop_reason / message / finish_reason injection)
 *
 * Style follows logger.service.test.cjs: node:test + node:assert/strict + require() dist artifact.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeOpenAiCompatibleFetch,
} = require("../dist/src/utils/llm-request-role-normalize");

/**
 * Build a Response whose body is an SSE stream assembled from an array of raw lines.
 * Each line ends with '\n' as OpenAI's protocol requires.
 */
function sseResponse(lines, headers = {}) {
  // SSE 协议每行必须是 "data: <payload>"，注意 data 后必须有空格
  const body = lines.map((l) => l + "\n").join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

/**
 * Read all chunks from a Response body as text.
 */
async function readBodyText(response) {
  return await response.text();
}

test("filterEmptyChoicesFromSSE: rewrite data line with normalized chunk (写回修复)", async () => {
  // 智谱 GLM 内网版 chunk：缺 message / 缺 finish_reason / 含 stop_reason 数字
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0,"stop_reason":154827}],"object":"chat.completion.chunk"}',
      'data: {"choices":[{"delta":{"content":"你好"},"index":0,"stop_reason":154827}],"object":"chat.completion.chunk"}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    // 数据行应该被写回（不包含 stop_reason）
    assert.ok(out.includes("你好"), "应包含原始 content '你好'");
    assert.ok(!out.includes("stop_reason"), "清洗后不应包含 stop_reason 字段");

    // 拆出每行 data: JSON，验证字段
    const dataLines = out
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");
    const first = JSON.parse(dataLines[0].slice(6));
    assert.equal(first.choices[0].delta.role, "assistant");
    assert.equal(first.choices[0].message.role, "assistant");
    assert.equal(first.choices[0].message.content, "");
    assert.equal(first.choices[0].finish_reason, null);
    assert.ok(!("stop_reason" in first.choices[0]), "stop_reason 已被删除");

    const second = JSON.parse(dataLines[1].slice(6));
    assert.equal(second.choices[0].delta.content, "你好");
    assert.ok(!("stop_reason" in second.choices[0]));

    // [DONE] 透传
    assert.ok(out.includes("data: [DONE]"), "[DONE] 应该透传");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: drop choices:[] usage block (智谱 GLM 流末尾)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      'data: {"choices":[{"delta":{"content":"完成"},"index":0}],"object":"chat.completion.chunk"}',
      // 智谱流末尾的 usage 统计块（choices:[]）
      'data: {"id":"abc","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20},"object":"chat.completion.chunk"}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    // usage 块应该被丢弃
    assert.ok(!out.includes("usage"), "choices:[] 的 usage 块应被丢弃");
    assert.ok(!out.includes("\"choices\":[]"), "choices:[] 块应被丢弃");
    // 正常 chunk 应该保留
    assert.ok(out.includes("完成"), "正常 chunk 应保留");
    assert.ok(out.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: merge delta.reasoning into delta.content (qwen3.6 CoT)", async () => {
  const originalFetch = globalThis.fetch;
  // qwen3.6 格式：delta 里有 reasoning 字段（推理内容）和可选 content
  globalThis.fetch = async () =>
    sseResponse([
      'data: {"choices":[{"index":0,"delta":{"reasoning":"先分析问题"},"logprobs":null,"finish_reason":null}],"object":"chat.completion.chunk"}',
      'data: {"choices":[{"index":0,"delta":{"reasoning":":用户问的是"},"logprobs":null,"finish_reason":null}],"object":"chat.completion.chunk"}',
      'data: {"choices":[{"index":0,"delta":{"content":"回答"},"logprobs":null,"finish_reason":null}],"object":"chat.completion.chunk"}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    const dataLines = out
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");

    const first = JSON.parse(dataLines[0].slice(6));
    // reasoning 应该被拼接到 content（reasoning 在前）
    assert.equal(first.choices[0].delta.content, "先分析问题", "reasoning 单独时写入 content");
    assert.equal(first.choices[0].delta.reasoning, "先分析问题", "reasoning 字段保留");

    const second = JSON.parse(dataLines[1].slice(6));
    assert.equal(second.choices[0].delta.content, ":用户问的是");

    const third = JSON.parse(dataLines[2].slice(6));
    // 已有 content 时，reasoning 为空字符串但走的是没有 reasoning 路径的 chunk —— 验证 content 不被破坏
    assert.equal(third.choices[0].delta.content, "回答");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: passthrough non-data lines (event:, id:, retry:, blank)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      "event:message",
      'id:1',
      "retry:10000",
      "",
      'data: {"choices":[{"delta":{"content":"hi"},"index":0}],"object":"chat.completion.chunk"}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    assert.ok(out.includes("event:message"), "event: 行透传");
    assert.ok(out.includes("id:1"), "id: 行透传");
    assert.ok(out.includes("retry:10000"), "retry: 行透传");
    assert.ok(out.includes("hi"), "data: 行正常处理");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: passthrough non-JSON data line", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      "data:not-json-payload",
      'data: {"choices":[{"delta":{"content":"ok"},"index":0}],"object":"chat.completion.chunk"}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    assert.ok(out.includes("data:not-json-payload"), "非 JSON data 行透传");
    assert.ok(out.includes("ok"), "正常 JSON 仍处理");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: standard OpenAI chunk passes through unchanged", async () => {
  // 标准 OpenAI 兼容：已有完整 message / finish_reason 等字段
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      "data: [DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    const dataLines = out
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");

    // 第一帧
    const first = JSON.parse(dataLines[0].slice(6));
    assert.equal(first.id, "chatcmpl-1");
    assert.equal(first.model, "gpt-4o-mini");
    assert.equal(first.choices[0].delta.role, "assistant");

    // 第三帧：finish_reason: "stop" 应该被保留（不能因为 undefined check 改成 null）
    const third = JSON.parse(dataLines[2].slice(6));
    assert.equal(third.choices[0].finish_reason, "stop", "已有 finish_reason='stop' 不应被覆盖");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: GLM-4.7-Flash real output (data: 无空格)", async () => {
  // 真实内网 GLM 输出：data: 后面无空格、含大量 delta chunk、无 stop_reason / message / finish_reason
  // 这是用户提供的真实流式输出样本
  const glmChunk = (content) =>
    `data:{"created":1783046177,"model":"GLM-4.7-Flash","id":"20260703_c5f531dbc1d04c06b9067eabd12102e0","choices":[{"delta":{"content":"${content}"},"index":0}],"object":"chat.completion.chunk"}`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseResponse([
      'data:{"created":1783046177,"model":"GLM-4.7-Flash","id":"abc","choices":[{"delta":{"role":"assistant","content":""},"index":0}],"object":"chat.completion.chunk"}',
      glmChunk("**"),
      glmChunk("大"),
      glmChunk("语言"),
      glmChunk("模型"),
      glmChunk("是"),
      "data:[DONE]",
    ]);

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    // 关键断言：GLM 真实格式（无空格）下 normalize 应该生效
    assert.ok(out.includes("大"), "GLM 真实 chunk 应被处理（含 '大'）");
    assert.ok(!out.includes("delta\\\":{"), "normalize 后应只剩完整 JSON 行");

    // 解析每个 data 行的 JSON，验证注入
    const dataLines = out
      .split("\n")
      .filter((l) => l.startsWith("data:") && !l.startsWith("data: [DONE]"));
    assert.ok(dataLines.length >= 3, `应至少有 3 个 data 行，实际 ${dataLines.length}`);

    // 第一帧：注入 role / message / finish_reason
    const first = JSON.parse(dataLines[0].slice(dataLines[0].startsWith("data: ") ? 6 : 5));
    assert.equal(first.choices[0].delta.role, "assistant");
    assert.equal(first.choices[0].message.role, "assistant");
    assert.equal(first.choices[0].message.content, "");
    assert.equal(first.choices[0].finish_reason, null);

    // 后续帧：delta.content 保留，message / finish_reason 也注入
    const second = JSON.parse(dataLines[1].slice(dataLines[1].startsWith("data: ") ? 6 : 5));
    assert.equal(second.choices[0].delta.content, "**");
    assert.equal(second.choices[0].message.role, "assistant");
    assert.equal(second.choices[0].finish_reason, null);

    // [DONE] 透传（注意无空格 'data:[DONE]' 形式）
    assert.ok(out.includes("[DONE]"), "[DONE] 应被透传");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterEmptyChoicesFromSSE: CRLF (\\r\\n) line endings", async () => {
  // 真实 HTTP 服务常用 CRLF；split('\n') 会留下 \r
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      'data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0,"stop_reason":154827}],"object":"chat.completion.chunk"}\r\n' +
        'data: {"choices":[{"delta":{"content":"你好"},"index":0,"stop_reason":154827}],"object":"chat.completion.chunk"}\r\n' +
        "data: [DONE]\r\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const out = await readBodyText(upstreamRes);

    assert.ok(!out.includes("stop_reason"), "CRLF 流下 stop_reason 也应被清洗");
    assert.ok(out.includes("你好"), "CRLF 流下 content 应保留");
    assert.ok(out.includes("[DONE]"), "CRLF 流下 [DONE] 应透传");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizeJsonResponse: clean non-streaming JSON response", async () => {
  const originalFetch = globalThis.fetch;
  // 智谱非流式 JSON：含 stop_reason 数字、缺 message
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            delta: { role: "assistant" },
            stop_reason: 154827,
            // 缺 message / finish_reason
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const wrappedFetch = composeOpenAiCompatibleFetch();
    const upstreamRes = await wrappedFetch("http://example.com/v1/chat/completions");
    const json = await upstreamRes.json();

    assert.equal(json.choices[0].delta.role, "assistant");
    assert.equal(json.choices[0].message.role, "assistant");
    assert.equal(json.choices[0].message.content, "");
    assert.equal(json.choices[0].finish_reason, null);
    assert.ok(!("stop_reason" in json.choices[0]), "stop_reason 数字应被删除");
  } finally {
    globalThis.fetch = originalFetch;
  }
});