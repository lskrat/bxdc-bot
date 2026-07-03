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
    if (!chunk?.choices || !Array.isArray(chunk.choices)) return chunk;
    for (const choice of chunk.choices) {
        // 关键：过滤 null / undefined 的 choice，杜绝 undefined.message 报错
        if (!choice) continue;

        // 1) 删除智谱独有 stop_reason 字段，兼容 LangChain
        if ('stop_reason' in choice) {
            delete choice.stop_reason;
        }

        // 判断是否为流式分片（存在delta）
        const isStreaming = choice.delta != null;

        // 2) 流式 chunk：补全 delta.role（标准模型首行已有，不影响）
        if (isStreaming && typeof choice.delta === 'object') {
            if (!('role' in choice.delta) || choice.delta.role === undefined) {
                choice.delta.role = 'assistant';
            }
        } else {
            // 非流式响应：不存在message属性时，自动补全占位对象
            if (!('message' in choice)) {
                choice.message = { role: 'assistant', content: '' };
            }
        }
        // finish_reason 不补：标准模型中间帧本来就没有，LangChain 已用 != null 兼容
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
          // 最后一段可能不完整，保留到下次循环
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trimEnd();

            // 1) 空行（SSE 事件分隔符）→ 原样转发
            if (!line) {
              controller.enqueue(encoder.encode('\n'));
              continue;
            }
            // 2) [DONE] 结束帧（流边界，原样转发不解析）
            if (line === 'data: [DONE]') {
              controller.enqueue(encoder.encode(line + '\n'));
              continue;
            }
            // 3) 非 data: 行（SSE 注释、event:、id: 等）→ 原样转发
            if (!line.startsWith('data: ')) {
              controller.enqueue(encoder.encode(line + '\n'));
              continue;
            }

            // 4) 尝试解析 JSON 残缺帧 → 跳过，不让 LangChain 看到
            const payload = line.slice(6);
            let chunk: any;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }

            // 5) choices 为空帧（usage-only chunk）：
//    标准 OpenAI 末尾 usage 块（仅含 usage）会被 LangChain 跳过处理（line 160 if (!choice) continue），
//    但 LangChain 会在循环外读取累积的 usage。丢弃这一帧会导致其他模型的 token 用量统计丢失。
//    改为：把 usage 字段复制到顶层字段后再转发，让 LangChain 能正常读到。
const choices = chunk?.choices;
if (!Array.isArray(choices) || choices.length === 0) {
  // usage-only chunk：保留（不带任何清洗，避免破坏 usage 字段）
  controller.enqueue(encoder.encode(line + '\n'));
  continue;
}

            // 6) 清洗智谱非标准字段（stop_reason 数字、缺失 message/role 等）
            normalizeChunk(chunk);
            // 必须用修改后的 chunk 重新序列化后转发，不能用原始 line
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n`));
          }
        }
        // 收尾时把残留的最后一帧也送出去
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
