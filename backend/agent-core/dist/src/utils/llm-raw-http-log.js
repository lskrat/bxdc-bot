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
const MAX_BODY_CHARS = 512 * 1024;
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
    if (text.length <= MAX_BODY_CHARS) {
        return { text, truncated: false };
    }
    return {
        text: `${text.slice(0, MAX_BODY_CHARS)}\n...[truncated, ${text.length - MAX_BODY_CHARS} more chars]`,
        truncated: true,
    };
}
function redactHeaders(headersInit) {
    if (!headersInit)
        return {};
    try {
        const h = new Headers(headersInit);
        const out = {};
        h.forEach((value, key) => {
            const lk = key.toLowerCase();
            out[key] = SENSITIVE_HEADER_NAMES.has(lk) ? '[REDACTED]' : value;
        });
        return out;
    }
    catch {
        return { _parseError: 'could not read headers' };
    }
}
function appendRecord(record) {
    try {
        ensureLogsDir();
        fs.appendFileSync(logFilePath(), `${JSON.stringify(record)}\n`, 'utf8');
    }
    catch {
    }
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
        return { text: '[non-string request body omitted]', truncated: false };
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