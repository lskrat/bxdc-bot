import { getLoggingFetchOrUndefined } from './llm-raw-http-log';

/**
 * Merges Request headers with init.headers (init wins), matching fetch(request, init) behavior.
 */
function mergeRequestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (input instanceof Request) {
    const merged = new Headers(input.headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        merged.set(key, value);
      });
    }
    return merged;
  }
  return new Headers(init?.headers);
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const s = contentType.toLowerCase();
  return s.includes('application/json') || s.includes('text/json');
}

async function readRequestBodyAsString(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | undefined> {
  if (init?.body != null) {
    const b = init.body;
    if (typeof b === 'string') return b;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    if (b instanceof ArrayBuffer) return Buffer.from(b).toString('utf8');
    if (ArrayBuffer.isView(b)) {
      return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf8');
    }
    if (typeof Blob !== 'undefined' && b instanceof Blob) {
      try {
        return await b.text();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  if (input instanceof Request && input.body) {
    try {
      return await input.clone().text();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function headersWithoutContentLength(h: Headers): Headers {
  const out = new Headers(h);
  out.delete('content-length');
  return out;
}

function messageHasToolInvocation(msg: Record<string, unknown>): boolean {
  const tc = msg.tool_calls;
  if (Array.isArray(tc) && tc.length > 0) return true;
  const fc = msg.function_call;
  if (fc != null && typeof fc === 'object') return true;
  return false;
}

/**
 * If the value is a JSON object with a top-level `messages` array, rewrite message
 * `role` of `assistant` / `assistank` / `ai` (case-insensitive) to `system`.
 *
 * **Does not rewrite** assistant messages that carry `tool_calls` / `function_call`.
 * Those must stay `assistant` so the API can pair the following `tool` messages via
 * `tool_call_id`; rewriting them to `system` breaks that linkage and commonly causes
 * the model to re-issue the same tool call in a loop.
 */
export function normalizeChatMessagesRolesInJsonText(text: string): { text: string; changed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { text, changed: false };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { text, changed: false };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.messages)) {
    return { text, changed: false };
  }
  let changed = false;
  const messages = obj.messages.map((m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
    const msg = m as Record<string, unknown>;
    const role = msg.role;
    if (typeof role === 'string') {
      const lr = role.toLowerCase();
      if (
        (lr === 'assistant' || lr === 'assistank' || lr === 'ai')
        && !messageHasToolInvocation(msg)
      ) {
        changed = true;
        return { ...msg, role: 'system' };
      }
    }
    return m;
  });
  if (!changed) return { text, changed: false };
  return { text: JSON.stringify({ ...obj, messages }), changed: true };
}

/**
 * Wraps `fetch` so outgoing JSON bodies with `messages` never use `role: assistant` (uses `system` for those turns instead).
 * Intended for OpenAI-compatible chat/completions clients (e.g. LangChain ChatOpenAI).
 */
export function wrapFetchNormalizeLlmMessageRoles(inner: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
      return inner(input, init);
    }

    const mergedHeaders = mergeRequestHeaders(input, init);
    const ct = mergedHeaders.get('content-type');
    if (!isJsonContentType(ct)) {
      return inner(input, init);
    }

    try {
      const raw = await readRequestBodyAsString(input, init);
      if (raw === undefined) {
        return inner(input, init);
      }
      const { text, changed } = normalizeChatMessagesRolesInJsonText(raw);
      if (!changed) {
        return inner(input, init);
      }
      const nextHeaders = headersWithoutContentLength(mergedHeaders);
      const nextInit: RequestInit = {
        ...init,
        body: text,
        headers: nextHeaders,
      };
      return inner(input, nextInit);
    } catch {
      return inner(input, init);
    }
  };
}

/**
 * Fetch for OpenAI-compatible clients: optional raw HTTP logging (env-controlled), then role normalization.
 */
export function composeOpenAiCompatibleFetch(): typeof fetch {
  const inner = globalThis.fetch.bind(globalThis);
  const withLog = getLoggingFetchOrUndefined() ?? inner;
  return wrapFetchNormalizeLlmMessageRoles(withLog);
}
