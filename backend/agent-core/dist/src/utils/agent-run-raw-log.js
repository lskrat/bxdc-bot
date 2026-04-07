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
exports.isAgentRunRawLogEnabled = isAgentRunRawLogEnabled;
exports.logAgentRunRawIfEnabled = logAgentRunRawIfEnabled;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const LOG_FILE_NAME = 'agentRun.log';
const DEFAULT_MAX_CHARS = 512 * 1024;
function maxChars() {
    const raw = process.env.AGENT_RUN_RAW_LOG_MAX_CHARS?.trim();
    if (!raw)
        return DEFAULT_MAX_CHARS;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CHARS;
}
function logsDir() {
    return path.join(process.cwd(), 'logs');
}
function logFilePath() {
    const override = process.env.AGENT_RUN_RAW_LOG_PATH?.trim();
    if (override) {
        return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
    }
    return path.join(logsDir(), LOG_FILE_NAME);
}
function ensureLogsDirForFile(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function isAgentRunRawLogEnabled() {
    const v = process.env.AGENT_RUN_RAW_LOG?.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}
function sanitizeValue(value, depth = 0) {
    if (depth > 12)
        return '[truncated-depth]';
    if (value == null)
        return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        const result = {};
        for (const [key, raw] of Object.entries(value)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('apikey')
                || lowerKey.includes('api_key')
                || lowerKey.includes('token')
                || lowerKey.includes('authorization')
                || lowerKey.includes('password')
                || lowerKey.includes('secret')) {
                result[key] = '[REDACTED]';
                continue;
            }
            result[key] = sanitizeValue(raw, depth + 1);
        }
        return result;
    }
    return String(value);
}
function logAgentRunRawIfEnabled(body, meta) {
    if (!isAgentRunRawLogEnabled()) {
        return;
    }
    try {
        const sanitized = sanitizeValue(body);
        const payload = {
            ts: new Date().toISOString(),
            id: (0, uuid_1.v4)(),
            route: 'POST /agent/run',
            sessionId: meta.sessionId,
            userId: meta.userId,
            body: sanitized,
        };
        const full = JSON.stringify(payload);
        const limit = maxChars();
        const line = full.length <= limit
            ? `${full}\n`
            : `${JSON.stringify({
                ts: payload.ts,
                id: payload.id,
                route: payload.route,
                sessionId: payload.sessionId,
                userId: payload.userId,
                truncated: true,
                totalChars: full.length,
                head: full.slice(0, limit),
            })}\n`;
        const filePath = logFilePath();
        ensureLogsDirForFile(filePath);
        fs.appendFileSync(filePath, line, 'utf8');
    }
    catch {
    }
}
//# sourceMappingURL=agent-run-raw-log.js.map