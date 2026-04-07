"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLlmRawHttpLogEnabled = isLlmRawHttpLogEnabled;
exports.getLoggingFetchOrUndefined = getLoggingFetchOrUndefined;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const LOG_FILE_NAME = 'llmOrg.log';
const MAX_STORED_RECORDS = 30;
const RAW_LOG_SECTION_LABEL = '----------------调用/返回----------------';
const DEFAULT_MAX_BODY_CHARS = 512 * 1024;
let persistChain = Promise.resolve();
function maxBodyChars() {
    const raw = process.env.LLM_RAW_HTTP_LOG_MAX_BODY_CHARS?.trim();
    if (!raw)
        return DEFAULT_MAX_BODY_CHARS;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BODY_CHARS;
}
const SENSITIVE_HEADER_NAMES = new Set([
    'authorization',
    'api-key',
    'x-api-key',
    'openai-api-key',
]);
function logsDir() {
    return path.join(process.cwd(), 'logs');
}
function logFilePath() {
    return path.join(logsDir(), LOG_FILE_NAME);
}
function ensureLogsDir() {
    const dir = logsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function isLlmRawHttpLogEnabled() {
    const v = process.env.LLM_RAW_HTTP_LOG?.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}
function truncateBody(text) {
    const limit = maxBodyChars();
    if (text.length <= limit) {
        return { text, truncated: false };
    }
    return {
        text: `${text.slice(0, limit)}\n...[truncated, ${text.length - limit} more chars]`,
        truncated: true,
    };
}
function tryParseJsonBody(text, truncated) {
    if (text === undefined)
        return undefined;
    if (truncated)
        return text;
    const t = text.trim();
    if (t.length === 0)
        return '';
    try {
        return JSON.parse(t);
    }
    catch {
        return text;
    }
}
function effectiveRequestHeaders(input, init) {
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
function headersObject(h) {
    const out = {};
    h.forEach((value, key) => {
        const lk = key.toLowerCase();
        out[key] = SENSITIVE_HEADER_NAMES.has(lk) ? '[REDACTED]' : value;
    });
    return out;
}
function loadExistingRecords(filePath) {
    if (!fs.existsSync(filePath))
        return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
        }
    }
    catch {
    }
    const out = [];
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t)
            continue;
        try {
            const row = JSON.parse(t);
            if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
                out.push(row);
            }
        }
        catch {
        }
    }
    return out;
}
function sectionDividerRecord() {
    return {
        ts: new Date().toISOString(),
        kind: 'llmRawLogSection',
        label: RAW_LOG_SECTION_LABEL,
    };
}
function appendRecord(record) {
    persistChain = persistChain
        .then(() => {
        ensureLogsDir();
        const p = logFilePath();
        const prev = loadExistingRecords(p);
        prev.push(record);
        const next = prev.length > MAX_STORED_RECORDS ? prev.slice(-MAX_STORED_RECORDS) : prev;
        fs.writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    })
        .catch(() => {
    });
}
function resolveUrl(input) {
    if (typeof input === 'string')
        return input;
    if (input instanceof URL)
        return input.toString();
    if (input instanceof Request)
        return input.url;
    return String(input);
}
function resolveMethod(input, init) {
    if (init?.method)
        return init.method;
    if (input instanceof Request)
        return input.method;
    return 'GET';
}
async function readRequestBodyForLog(input, init) {
    if (init?.body != null) {
        const b = init.body;
        if (typeof b === 'string') {
            return truncateBody(b);
        }
        if (Buffer.isBuffer(b)) {
            return truncateBody(b.toString('utf8'));
        }
        if (b instanceof ArrayBuffer) {
            return truncateBody(Buffer.from(b).toString('utf8'));
        }
        if (ArrayBuffer.isView(b)) {
            return truncateBody(Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf8'));
        }
        if (typeof Blob !== 'undefined' && b instanceof Blob) {
            try {
                return truncateBody(await b.text());
            }
            catch {
                return { text: '[blob body unreadable]', truncated: false };
            }
        }
        return { text: '[non-buffer request body omitted: stream or FormData]', truncated: false };
    }
    if (input instanceof Request && input.body) {
        try {
            const clone = input.clone();
            const t = await clone.text();
            return truncateBody(t);
        }
        catch {
            return { text: '[request body unreadable]', truncated: false };
        }
    }
    return undefined;
}
async function logResponseClone(correlationId, response) {
    try {
        const clone = response.clone();
        const text = await clone.text();
        const { text: bodyText, truncated } = truncateBody(text);
        appendRecord({
            ts: new Date().toISOString(),
            direction: 'response',
            correlationId,
            status: response.status,
            statusText: response.statusText,
            headers: headersObject(response.headers),
            contentType: response.headers.get('content-type') ?? undefined,
            body: tryParseJsonBody(bodyText, truncated),
            bodyLengthChars: bodyText.length,
            truncated,
        });
        appendRecord(sectionDividerRecord());
    }
    catch {
        appendRecord({
            ts: new Date().toISOString(),
            direction: 'response',
            correlationId,
            status: response.status,
            statusText: response.statusText,
            body: '[failed to read response body for log]',
            truncated: false,
        });
        appendRecord(sectionDividerRecord());
    }
}
function getLoggingFetchOrUndefined() {
    if (!isLlmRawHttpLogEnabled()) {
        return undefined;
    }
    const innerFetch = globalThis.fetch.bind(globalThis);
    return async (input, init) => {
        const correlationId = (0, uuid_1.v4)();
        const url = resolveUrl(input);
        const method = resolveMethod(input, init);
        try {
            const effHeaders = effectiveRequestHeaders(input, init);
            const headers = headersObject(effHeaders);
            const bodyInfo = await readRequestBodyForLog(input, init);
            appendRecord({
                ts: new Date().toISOString(),
                direction: 'request',
                correlationId,
                requestLine: `${method} ${url}`,
                method,
                url,
                headers,
                body: tryParseJsonBody(bodyInfo?.text, bodyInfo?.truncated ?? false),
                bodyLengthChars: bodyInfo?.text != null ? bodyInfo.text.length : undefined,
                truncated: bodyInfo?.truncated ?? false,
            });
        }
        catch {
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
//# sourceMappingURL=llm-raw-http-log.js.map