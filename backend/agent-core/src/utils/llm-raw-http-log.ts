import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const LOG_FILE_NAME = 'llmOrg.log';
const MAX_BODY_CHARS = 512 * 1024;

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'api-key',
  'x-api-key',
  'openai-api-key',
]);

function logsDir(): string {
  return path.join(process.cwd(), 'logs');
}

function logFilePath(): string {
  return path.join(logsDir(), LOG_FILE_NAME);
}

function ensureLogsDir(): void {
  const dir = logsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * When true, wraps the OpenAI client's fetch to append raw HTTP-ish records to logs/llmOrg.log.
 * Values: true, 1, yes, on (case-insensitive).
 */
export function isLlmRawHttpLogEnabled(): boolean {
  const v = process.env.LLM_RAW_HTTP_LOG?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function truncateBody(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_BODY_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, MAX_BODY_CHARS)}\n...[truncated, ${text.length - MAX_BODY_CHARS} more chars]`,
    truncated: true,
  };
}

function redactHeaders(headersInit: HeadersInit | undefined): Record<string, string> {
  if (!headersInit) return {};
  try {
    const h = new Headers(headersInit);
    const out: Record<string, string> = {};
    h.forEach((value, key) => {
      const lk = key.toLowerCase();
      out[key] = SENSITIVE_HEADER_NAMES.has(lk) ? '[REDACTED]' : value;
    });
    return out;
  } catch {
    return { _parseError: 'could not read headers' };
  }
}

function appendRecord(record: Record<string, unknown>): void {
  try {
    ensureLogsDir();
    fs.appendFileSync(logFilePath(), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // Never break LLM calls due to logging
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return 'GET';
}

async function readRequestBodyForLog(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ text: string; truncated: boolean } | undefined> {
  if (init?.body != null) {
    const b = init.body;
    if (typeof b === 'string') {
      return truncateBody(b);
    }
    if (Buffer.isBuffer(b)) {
      return truncateBody(b.toString('utf8'));
    }
    return { text: '[non-string request body omitted]', truncated: false };
  }
  if (input instanceof Request && input.body) {
    try {
      const clone = input.clone();
      const t = await clone.text();
      return truncateBody(t);
    } catch {
      return { text: '[request body unreadable]', truncated: false };
    }
  }
  return undefined;
}

async function logResponseClone(
  correlationId: string,
  response: Response,
): Promise<void> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    const { text: body, truncated } = truncateBody(text);
    appendRecord({
      ts: new Date().toISOString(),
      direction: 'response',
      correlationId,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') ?? undefined,
      body,
      truncated,
    });
  } catch {
    appendRecord({
      ts: new Date().toISOString(),
      direction: 'response',
      correlationId,
      status: response.status,
      statusText: response.statusText,
      body: '[failed to read response body for log]',
      truncated: false,
    });
  }
}

/**
 * Returns a fetch wrapper that logs request + response bodies to logs/llmOrg.log, or undefined when disabled.
 */
export function getLoggingFetchOrUndefined(): typeof fetch | undefined {
  if (!isLlmRawHttpLogEnabled()) {
    return undefined;
  }

  const innerFetch: typeof fetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const correlationId = uuidv4();
    const url = resolveUrl(input);
    const method = resolveMethod(input, init);

    try {
      const headers = redactHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const bodyInfo = await readRequestBodyForLog(input, init);
      appendRecord({
        ts: new Date().toISOString(),
        direction: 'request',
        correlationId,
        method,
        url,
        headers,
        body: bodyInfo?.text,
        truncated: bodyInfo?.truncated ?? false,
      });
    } catch {
      appendRecord({
        ts: new Date().toISOString(),
        direction: 'request',
        correlationId,
        method,
        url,
        body: '[failed to serialize request for log]',
        truncated: false,
      });
    }

    const response = await innerFetch(input, init);

    void logResponseClone(correlationId, response);

    return response;
  };
}
