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
            if (line.startsWith('data: ')) {
              const payload = line.slice(6);
              if (payload === '[DONE]') {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }
              try {
                const chunk = JSON.parse(payload);
                if (Array.isArray(chunk.choices) && chunk.choices.length === 0) {
                  continue;
                }
              } catch {
                // non-JSON data line: pass through unchanged
              }
            }
            controller.enqueue(encoder.encode(line + '\n'));
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
    const response = await loggingFetch(input, init);
    return filterEmptyChoicesFromSSE(response);
  };
}
