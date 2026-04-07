"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChatMessagesRolesInJsonText = normalizeChatMessagesRolesInJsonText;
exports.wrapFetchNormalizeLlmMessageRoles = wrapFetchNormalizeLlmMessageRoles;
exports.composeOpenAiCompatibleFetch = composeOpenAiCompatibleFetch;
const llm_raw_http_log_1 = require("./llm-raw-http-log");
function mergeRequestHeaders(input, init) {
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
function isJsonContentType(contentType) {
    if (!contentType)
        return false;
    const s = contentType.toLowerCase();
    return s.includes('application/json') || s.includes('text/json');
}
async function readRequestBodyAsString(input, init) {
    if (init?.body != null) {
        const b = init.body;
        if (typeof b === 'string')
            return b;
        if (Buffer.isBuffer(b))
            return b.toString('utf8');
        if (b instanceof ArrayBuffer)
            return Buffer.from(b).toString('utf8');
        if (ArrayBuffer.isView(b)) {
            return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf8');
        }
        if (typeof Blob !== 'undefined' && b instanceof Blob) {
            try {
                return await b.text();
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
    if (input instanceof Request && input.body) {
        try {
            return await input.clone().text();
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function headersWithoutContentLength(h) {
    const out = new Headers(h);
    out.delete('content-length');
    return out;
}
function normalizeChatMessagesRolesInJsonText(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return { text, changed: false };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { text, changed: false };
    }
    const obj = parsed;
    if (!Array.isArray(obj.messages)) {
        return { text, changed: false };
    }
    let changed = false;
    const messages = obj.messages.map((m) => {
        if (!m || typeof m !== 'object' || Array.isArray(m))
            return m;
        const msg = m;
        const role = msg.role;
        if (typeof role === 'string') {
            const lr = role.toLowerCase();
            if (lr === 'assistant' || lr === 'assistank') {
                changed = true;
                return { ...msg, role: 'ai' };
            }
        }
        return m;
    });
    if (!changed)
        return { text, changed: false };
    return { text: JSON.stringify({ ...obj, messages }), changed: true };
}
function wrapFetchNormalizeLlmMessageRoles(inner) {
    return async (input, init) => {
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
            const nextInit = {
                ...init,
                body: text,
                headers: nextHeaders,
            };
            return inner(input, nextInit);
        }
        catch {
            return inner(input, init);
        }
    };
}
function composeOpenAiCompatibleFetch() {
    const inner = globalThis.fetch.bind(globalThis);
    const withLog = (0, llm_raw_http_log_1.getLoggingFetchOrUndefined)() ?? inner;
    return wrapFetchNormalizeLlmMessageRoles(withLog);
}
//# sourceMappingURL=llm-request-role-normalize.js.map