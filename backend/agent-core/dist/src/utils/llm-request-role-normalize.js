"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeOpenAiCompatibleFetch = composeOpenAiCompatibleFetch;
const llm_raw_http_log_1 = require("./llm-raw-http-log");
function composeOpenAiCompatibleFetch() {
    const inner = globalThis.fetch.bind(globalThis);
    return (0, llm_raw_http_log_1.getLoggingFetchOrUndefined)() ?? inner;
}
//# sourceMappingURL=llm-request-role-normalize.js.map