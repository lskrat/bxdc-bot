import { getLoggingFetchOrUndefined, type LlmFetchHttpLogContext } from './llm-raw-http-log';

/**
 * Some LLM providers (e.g. Zhipu glm-4.7) send SSE chunks with empty `choices: []`
 * at the end of the stream to report usage stats.
 * LangChain ChatOpenAI stream parser accesses `choices[0].message` which
 * is undefined for empty arrays, crashing with:
 *   "Cannot read properties of undefined (reading 'message')"
 *
 * This filter intercepts SSE content-type responses and drops data lines
 * whose JSON payload has an empty choices array.
 */
/**
 * Zhipu 内网版（非标准 OpenAI 兼容）在流末尾会发送带有特殊字段的统计块：
 *   - choices: []
 *   - 或者带非标准的 stop_reason（如数字 154827）
 * LangChain ChatOpenAI 解析器对 choices[0] 为 undefined 或 message 缺失时崩溃：
 *   "Cannot read properties of undefined (reading 'message')"
 *
 * 此函数在 SSE 流中拦截 + 清洗这两类异常块，避免污染下游。
 */
function normalizeChunk(chunk: any): any {
  if (!chunk.choices || !Array.isArray(chunk.choices)) return chunk;
  for (const choice of chunk.choices) {
    // 1) 智谱特有字段 stop_reason（数字枚举 154827）→ 删除，LangChain 不认
    if ('stop_reason' in choice) {
      delete choice.stop_reason;
    }
    // 2) 流式 chunk：注入 delta.role（虽然智谱第1行有 role，但稳妥起见所有 chunk 都补）
    if (choice.delta && typeof choice.delta === 'object') {
      if (choice.delta.role === undefined) {
        choice.delta.role = 'assistant';
      }
    }
    // 3) 非流式：message 缺失补占位
    if (choice.message === undefined) {
      choice.message = { role: 'assistant', content: '' };
    }
    // 4) 智谱内网版缺少 finish_reason，LangChain 期望字段；补 null 占位
    if (choice.finish_reason === undefined) {
      choice.finish_reason = null;
    }
    // 5) CoT 模型（qwen3.6 等）的推理内容放在 delta.reasoning，
    //    LangChain 只读 delta.content 会丢推理；拼接到 content 前
    if (
      choice.delta &&
      typeof choice.delta === 'object' &&
      typeof choice.delta.reasoning === 'string' &&
      choice.delta.reasoning.length > 0
    ) {
      const existing = typeof choice.delta.content === 'string' ? choice.delta.content : '';
      choice.delta.content = choice.delta.reasoning + existing;
    }
  }
  return chunk;
}

/**
 * 对 JSON 完整响应做智谱非标准字段清洗（stop_reason 数字、缺失 message 等）。
 * 非流式响应不走 SSE 分支，需要单独处理。
 */
async function normalizeJsonResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) return response;
  if (!contentType.includes('application/json')) return response;

  // 必须 clone 才能读取 body（body 是单次消费流）
  const cloned = response.clone();
  try {
    const text = await cloned.text();
    if (!text) return response;
    const json = JSON.parse(text);
    if (json && Array.isArray(json.choices)) {
      normalizeChunk(json);
    }
    return new Response(JSON.stringify(json), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
}

function filterEmptyChoicesFromSSE(response: Response): Response {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) return response;

  const reader = response.body?.getReader();
  if (!reader) return response;

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              controller.enqueue(encoder.encode(line + '\n'));
              continue;
            }
            const payload = line.slice(6);
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode(line + '\n'));
              continue;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(payload);
            } catch {
              // 非 JSON data 行 → 透传
              controller.enqueue(encoder.encode(line + '\n'));
              continue;
            }
            // 1) 跳过不含有效 choices 的 SSE 块（智谱等非标准实现会在流末尾
            //    发送 choices:[] 或缺少 choices 字段的 usage 统计块，
            //    LangChain ChatOpenAI 解析时 choices[0] 为 undefined 会崩溃）
            if (
              !parsed.choices ||
              !Array.isArray(parsed.choices) ||
              parsed.choices.length === 0
            ) {
              continue;
            }
            // 2) 清洗智谱非标准字段（stop_reason 数字枚举、缺失的 message 等）
            normalizeChunk(parsed);
            // 3) 重新 stringify 写回（修复：原代码 normalize 后用原始 line 输出，
            //    导致清洗无效，LangChain 仍收到缺 message 的原 chunk）
            const newPayload = JSON.stringify(parsed);
            controller.enqueue(encoder.encode('data: ' + newPayload + '\n'));
          }
        }
        if (buffer) {
          controller.enqueue(encoder.encode(buffer));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Fetch for OpenAI-compatible clients: optional raw HTTP logging (env-controlled)
 * + SSE empty-choices filter for Zhipu compatibility.
 */
export function composeOpenAiCompatibleFetch(ctx?: LlmFetchHttpLogContext): typeof fetch {
  const inner = globalThis.fetch.bind(globalThis);
  const loggingFetch = getLoggingFetchOrUndefined(ctx) ?? inner;
  return async (input, init) => {
    let response = await loggingFetch(input, init);
    // 非流式 JSON 响应：智谱非标准字段清洗（stop_reason 数字等）
    response = await normalizeJsonResponse(response);
    // SSE 流式响应：过滤 choices:[] 块 + 注入 delta.role
    response = filterEmptyChoicesFromSSE(response);
    return response;
  };
}
