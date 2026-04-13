"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavaApiTool = exports.JavaServerLookupTool = exports.JavaLinuxScriptTool = exports.JavaComputeTool = exports.JavaSshTool = exports.JavaSkillGeneratorTool = void 0;
exports.describeGatewayExtendedTool = describeGatewayExtendedTool;
exports.loadGatewayExtendedTools = loadGatewayExtendedTools;
exports.buildConfirmedToolInputString = buildConfirmedToolInputString;
exports.invokeExtendedSkillWithConfirmed = invokeExtendedSkillWithConfirmed;
const messages_1 = require("@langchain/core/messages");
const langgraph_1 = require("@langchain/langgraph");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const pinyin_pro_1 = require("pinyin-pro");
const ajv = new ajv_1.default({ allErrors: true, useDefaults: true });
(0, ajv_formats_1.default)(ajv);
const COMPUTE_OPERATIONS = [
    "add",
    "subtract",
    "multiply",
    "divide",
    "factorial",
    "square",
    "sqrt",
    "timestamp_to_date",
    "date_diff_days",
];
const computeToolInputSchema = zod_1.z.object({
    operation: zod_1.z
        .enum(COMPUTE_OPERATIONS)
        .describe("add|subtract|multiply|divide: two numbers in operands. factorial|square|sqrt: one number. timestamp_to_date: one Unix timestamp (seconds or ms). date_diff_days: two calendar dates as YYYY-MM-DD strings."),
    operands: zod_1.z
        .array(zod_1.z.union([zod_1.z.number(), zod_1.z.string()]))
        .min(1)
        .describe("add: [3,5]. subtract|multiply|divide: [a,b]. factorial|square|sqrt: [n]. timestamp_to_date: [unixTs]. date_diff_days: [\"2026-03-08\",\"2026-03-12\"]."),
});
const serverLookupToolInputSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1)
        .describe("Server alias name (e.g. 'prod-db', 'web-01') to look up connection details (ip, username, etc)."),
});
const linuxScriptToolInputSchema = zod_1.z.object({
    serverId: zod_1.z
        .string()
        .min(1)
        .describe("Preconfigured server identifier (e.g. 'prod-01', 'test-db')"),
    command: zod_1.z
        .string()
        .min(1)
        .describe("Shell command to execute on the server"),
});
const apiCallerToolInputSchema = zod_1.z.object({
    url: zod_1.z.string().url().describe("Full target URL"),
    method: zod_1.z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
        .default("GET")
        .describe("HTTP method"),
    headers: zod_1.z
        .record(zod_1.z.string(), zod_1.z.string())
        .optional()
        .describe("Additional headers (Authorization, Content-Type, etc.)"),
    body: zod_1.z
        .any()
        .optional()
        .describe("Request body (object, string, or null)"),
});
const sshExecutorToolInputSchema = zod_1.z.object({
    host: zod_1.z.string().min(1).describe("SSH host (IP or hostname)"),
    username: zod_1.z.string().min(1).describe("SSH username"),
    command: zod_1.z.string().min(1).describe("Shell command to execute"),
    privateKey: zod_1.z.string().optional().describe("Private key content (PEM format) - mutually exclusive with password"),
    password: zod_1.z.string().optional().describe("Password for authentication - mutually exclusive with privateKey"),
    confirmed: zod_1.z
        .boolean()
        .default(false)
        .describe("Set to true to skip confirmation for potentially dangerous commands (rm -rf, reboot, etc.)"),
});
const skillGeneratorAllowOverwriteSchema = zod_1.z.preprocess((val) => {
    if (val === undefined || val === null)
        return undefined;
    if (typeof val === "boolean")
        return val;
    if (typeof val === "string") {
        const v = val.trim().toLowerCase();
        if (v === "true" || v === "1" || v === "yes")
            return true;
        if (v === "false" || v === "0" || v === "no" || v === "")
            return false;
    }
    return val;
}, zod_1.z.boolean().optional().default(false));
const skillGeneratorToolInputSchema = zod_1.z.discriminatedUnion("targetType", [
    zod_1.z.object({
        targetType: zod_1.z.literal("api"),
        rawDescription: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        method: zod_1.z.string().optional(),
        endpoint: zod_1.z.string().optional(),
        interfaceDescription: zod_1.z.string().optional(),
        parameterContract: zod_1.z.any().optional(),
        allowOverwrite: skillGeneratorAllowOverwriteSchema,
    }),
    zod_1.z.object({
        targetType: zod_1.z.literal("ssh"),
        rawDescription: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        command: zod_1.z.string().optional(),
        allowOverwrite: skillGeneratorAllowOverwriteSchema,
    }),
    zod_1.z.object({
        targetType: zod_1.z.literal("openclaw"),
        rawDescription: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        systemPrompt: zod_1.z.string().optional(),
        allowOverwrite: skillGeneratorAllowOverwriteSchema,
    }),
    zod_1.z.object({
        targetType: zod_1.z.literal("template"),
        rawDescription: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        prompt: zod_1.z.string().optional(),
        allowOverwrite: skillGeneratorAllowOverwriteSchema,
    }),
]);
const tool_trace_context_1 = require("./tool-trace-context");
function formatToolError(error) {
    if (axios_1.default.isAxiosError(error)) {
        const status = error.response?.status;
        const responseBody = error.response?.data;
        const baseMessage = error.message || 'Axios request failed';
        const statusPart = status ? ` (status ${status})` : '';
        if (typeof responseBody === 'string' && responseBody.trim()) {
            return `${baseMessage}${statusPart}: ${responseBody.trim()}`;
        }
        if (responseBody && typeof responseBody === 'object') {
            try {
                return `${baseMessage}${statusPart}: ${JSON.stringify(responseBody)}`;
            }
            catch {
                return `${baseMessage}${statusPart}`;
            }
        }
        return `${baseMessage}${statusPart}`;
    }
    if (error instanceof Error)
        return error.message || error.name;
    if (typeof error === 'string')
        return error;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function readPreset(config) {
    const value = config.preset ?? config.profile;
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim();
    return normalized || undefined;
}
function isCurrentTimeSkillConfig(config) {
    const kind = (config.kind || "").toLowerCase();
    const operation = (config.operation || "").toLowerCase();
    const preset = (readPreset(config) || "").toLowerCase();
    return (kind === "time"
        || (kind === "api" && (preset === "current-time" || operation === "current-time"))
        || operation === "current-time");
}
function isServerMonitorSkillConfig(config) {
    const kind = (config.kind || "").toLowerCase();
    const operation = (config.operation || "").toLowerCase();
    const preset = (readPreset(config) || "").toLowerCase();
    return (kind === "monitor"
        || (kind === "ssh" && (preset === "server-resource-status" || operation === "server-resource-status"))
        || operation === "server-resource-status");
}
const gatewayExtendedToolRegistry = new Map();
const gatewayExtendedToolIdRegistry = new Map();
function normalizeToolName(name, id) {
    let processedName = name;
    if (/[\u4e00-\u9fff]/.test(name)) {
        try {
            processedName = (0, pinyin_pro_1.pinyin)(name, { toneType: "none", type: "array" }).join(" ");
        }
        catch {
            processedName = name;
        }
    }
    const normalized = processedName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const prefix = "extended_";
    const maxLen = 64 - prefix.length;
    const truncated = normalized.substring(0, maxLen).replace(/_+$/, "");
    return truncated ? `${prefix}${truncated}` : `extended_skill_${id}`;
}
function normalizeExecutionMode(executionMode) {
    return executionMode?.toUpperCase() === "OPENCLAW" ? "OPENCLAW" : "CONFIG";
}
function localizeExecutionMode(executionMode) {
    return normalizeExecutionMode(executionMode) === "OPENCLAW" ? "自主规划" : "预配置";
}
function registerGatewayToolMetadata(toolName, skill) {
    const metadata = {
        displayName: skill.name || `skill_${skill.id}`,
        executionMode: normalizeExecutionMode(skill.executionMode),
        executionLabel: localizeExecutionMode(skill.executionMode),
    };
    gatewayExtendedToolRegistry.set(toolName, metadata);
    gatewayExtendedToolRegistry.set(toolName.replace(/_/g, "-"), metadata);
    gatewayExtendedToolIdRegistry.set(skill.id, metadata);
}
function describeGatewayExtendedTool(toolName) {
    const metadata = gatewayExtendedToolRegistry.get(toolName)
        ?? gatewayExtendedToolRegistry.get(toolName.replace(/-/g, "_"))
        ?? gatewayExtendedToolRegistry.get(toolName.replace(/_/g, "-"));
    if (metadata) {
        return {
            displayName: metadata.displayName,
            kind: 'skill',
            executionMode: metadata.executionMode,
            executionLabel: metadata.executionLabel,
        };
    }
    const idMatch = toolName.match(/(\d+)$/);
    if (!idMatch)
        return null;
    const skillId = Number(idMatch[1]);
    if (!Number.isFinite(skillId))
        return null;
    const idDisplayName = gatewayExtendedToolIdRegistry.get(skillId);
    if (!idDisplayName)
        return null;
    return {
        displayName: idDisplayName.displayName,
        kind: 'skill',
        executionMode: idDisplayName.executionMode,
        executionLabel: idDisplayName.executionLabel,
    };
}
function normalizeExtendedConfig(cfg) {
    const next = { ...cfg };
    const rawPc = cfg.parameterContract;
    if (typeof rawPc === "string" && rawPc.trim()) {
        try {
            const parsed = JSON.parse(rawPc);
            if (parsed && typeof parsed === "object") {
                next.parameterContract = parsed;
            }
        }
        catch {
        }
    }
    return next;
}
function parseSkillConfig(skill) {
    if (!skill.configuration || !skill.configuration.trim())
        return {};
    try {
        const parsed = JSON.parse(skill.configuration);
        if (!parsed || typeof parsed !== "object")
            return {};
        return normalizeExtendedConfig(parsed);
    }
    catch {
        return {};
    }
}
function isEmptyishValue(value, depth = 0) {
    if (depth > 12)
        return false;
    if (value === undefined || value === null)
        return true;
    if (typeof value === "string")
        return value.trim() === "";
    if (typeof value === "number" || typeof value === "boolean")
        return false;
    if (Array.isArray(value)) {
        return value.length === 0 || value.every((v) => isEmptyishValue(v, depth + 1));
    }
    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0)
            return true;
        return keys.every((k) => isEmptyishValue(value[k], depth + 1));
    }
    return false;
}
function isEmptyApiToolInput(input) {
    if (!input?.trim())
        return true;
    const payload = parseToolInput(input);
    const keys = Object.keys(payload);
    if (keys.length === 0)
        return true;
    return keys.every((k) => isEmptyishValue(payload[k]));
}
function hasApiProgressiveDisclosureMaterial(config) {
    const desc = typeof config.interfaceDescription === "string" && config.interfaceDescription.trim().length > 0;
    const pc = config.parameterContract;
    const hasContract = pc != null && typeof pc === "object";
    return desc || hasContract;
}
function appendParameterContractToToolDescription(baseDescription, config) {
    const contract = config.parameterContract;
    if (!contract || typeof contract !== "object") {
        return baseDescription;
    }
    const props = contract.type === "object"
        && contract.properties
        && typeof contract.properties === "object"
        && !Array.isArray(contract.properties)
        ? contract.properties
        : null;
    if (props && Object.keys(props).length > 0) {
        const requiredList = Array.isArray(contract.required) ? contract.required : [];
        const lines = Object.entries(props)
            .map(([key, prop]) => {
            const req = requiredList.includes(key) ? " (required)" : "";
            const desc = prop?.description ? `: ${prop.description}` : "";
            const type = prop?.type ? ` [${prop.type}]` : "";
            const enums = Array.isArray(prop?.enum) ? ` (enum: ${prop.enum.join(", ")})` : "";
            const def = prop?.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : "";
            return `  - ${key}${req}${type}${desc}${enums}${def}`;
        })
            .join("\n");
        return `${baseDescription}\n\nParameters:\n${lines}`;
    }
    try {
        return `${baseDescription}\n\nParameter contract (JSON Schema):\n${JSON.stringify(contract, null, 2)}`;
    }
    catch {
        return baseDescription;
    }
}
function parseCheckTimePayload(payload) {
    if (typeof payload === "string") {
        const match = payload.match(/QZOutputJson=\{.*?"t"\s*:\s*"?(?<ts>\d{10,13})"?/);
        const tsRaw = match?.groups?.ts;
        if (!tsRaw)
            return null;
        const tsNum = Number(tsRaw);
        if (!Number.isFinite(tsNum))
            return null;
        const timestampMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
        return { timestamp: tsNum, isoTime: new Date(timestampMs).toISOString() };
    }
    if (payload && typeof payload === "object") {
        const direct = payload.t;
        if (typeof direct === "string" || typeof direct === "number") {
            const tsNum = Number(direct);
            if (Number.isFinite(tsNum)) {
                const timestampMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
                return { timestamp: tsNum, isoTime: new Date(timestampMs).toISOString() };
            }
        }
    }
    return null;
}
function parseToolInput(input) {
    if (!input?.trim())
        return {};
    try {
        const parsed = JSON.parse(input);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function normalizeApiSkillPayload(payload) {
    const next = { ...payload };
    const rawInput = next.input;
    if (typeof rawInput === "string" && rawInput.trim()) {
        try {
            const inner = JSON.parse(rawInput.trim());
            if (inner && typeof inner === "object" && !Array.isArray(inner)) {
                delete next.input;
                return { ...inner, ...next };
            }
        }
        catch {
        }
    }
    return next;
}
function pushScalarDefault(out, key, value) {
    if (value === undefined)
        return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
    }
}
function collectParameterDefaults(parameterContract) {
    const out = {};
    if (!parameterContract || typeof parameterContract !== "object" || Array.isArray(parameterContract)) {
        return out;
    }
    const pc = parameterContract;
    if (pc.type === "object"
        && pc.properties
        && typeof pc.properties === "object"
        && !Array.isArray(pc.properties)) {
        const props = pc.properties;
        for (const [key, spec] of Object.entries(props)) {
            if (!spec || typeof spec !== "object")
                continue;
            pushScalarDefault(out, key, spec.default);
        }
        return out;
    }
    for (const [key, spec] of Object.entries(pc)) {
        if (key === "required" && Array.isArray(spec))
            continue;
        if (!spec || typeof spec !== "object" || Array.isArray(spec))
            continue;
        pushScalarDefault(out, key, spec.default);
    }
    return out;
}
function normalizeGeneratedOperation(value) {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || "api_request";
}
function deriveSkillName(input) {
    if (typeof input.name === "string" && input.name.trim()) {
        return input.name.trim();
    }
    if (input.targetType === "api" && typeof input.endpoint === "string" && input.endpoint.trim()) {
        try {
            const url = new URL(input.endpoint);
            const pathPart = url.pathname
                .split("/")
                .filter(Boolean)
                .slice(-2)
                .join(" ");
            const hostPart = url.hostname.replace(/^www\./, "");
            const candidate = `${hostPart} ${pathPart}`.trim();
            if (candidate)
                return `API ${candidate}`;
        }
        catch {
        }
    }
    if (input.targetType === "ssh" && typeof input.command === "string" && input.command.trim()) {
        const firstWord = input.command.trim().split(/\s+/)[0];
        if (firstWord)
            return `SSH ${firstWord}`;
    }
    if (input.targetType === "openclaw") {
        return "Generated OPENCLAW Skill";
    }
    if (input.targetType === "template") {
        return "Generated Template Skill";
    }
    return "Generated Skill";
}
function deriveSkillDescription(input, name) {
    if (typeof input.description === "string" && input.description.trim()) {
        return input.description.trim();
    }
    if (typeof input.rawDescription === "string" && input.rawDescription.trim()) {
        return input.rawDescription.trim();
    }
    if (input.targetType === "api") {
        const method = typeof input.method === "string" ? input.method.toUpperCase() : "API";
        const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
        return endpoint ? `${name}。通过 ${method} ${endpoint} 发起请求。` : name;
    }
    if (input.targetType === "ssh") {
        return `${name}。在服务器上执行命令。`;
    }
    if (input.targetType === "openclaw") {
        return `${name}。自主规划执行任务。`;
    }
    if (input.targetType === "template") {
        return `${name}。可复用的提示词模板。`;
    }
    return name;
}
function sanitizeConfigForDisplay(config) {
    return config;
}
function buildValidationSummary(result) {
    if (result.startsWith("Error ")) {
        return {
            success: false,
            error: result,
        };
    }
    try {
        const parsed = JSON.parse(result);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
            return {
                success: false,
                parsed,
                error: String(parsed.error || "Validation failed"),
            };
        }
        return {
            success: true,
            parsed,
        };
    }
    catch {
        return {
            success: true,
            raw: result,
        };
    }
}
function buildGeneratedSkill(input) {
    const missingFields = [];
    const targetType = input.targetType || "api";
    if (targetType === "api") {
        const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
        const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : "";
        if (!endpoint)
            missingFields.push("endpoint");
        if (!method)
            missingFields.push("method");
        if (!input.interfaceDescription?.trim())
            missingFields.push("interfaceDescription");
        if (!input.parameterContract)
            missingFields.push("parameterContract");
        if (endpoint) {
            try {
                new URL(endpoint);
            }
            catch {
                missingFields.push("endpoint(valid URL)");
            }
        }
    }
    else if (targetType === "ssh") {
        if (!input.command?.trim()) {
            missingFields.push("command");
        }
    }
    else if (targetType === "openclaw") {
        if (!input.systemPrompt?.trim()) {
            missingFields.push("systemPrompt");
        }
    }
    else if (targetType === "template") {
        if (!input.prompt?.trim()) {
            missingFields.push("prompt");
        }
    }
    else {
        missingFields.push("targetType(api|ssh|openclaw|template)");
    }
    if (missingFields.length > 0) {
        return { missingFields };
    }
    const name = deriveSkillName({ ...input, targetType });
    const description = deriveSkillDescription({ ...input, targetType }, name);
    let config = {};
    let executionMode = "CONFIG";
    if (targetType === "api") {
        const rawPc = input.parameterContract;
        const parameterContract = typeof rawPc === "string"
            ? (() => { try {
                const p = JSON.parse(rawPc);
                return (p && typeof p === "object") ? p : rawPc;
            }
            catch {
                return rawPc;
            } })()
            : rawPc;
        config = {
            kind: "api",
            operation: normalizeGeneratedOperation(name),
            method: input.method?.trim().toUpperCase(),
            endpoint: input.endpoint?.trim(),
            ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
            ...(input.query && Object.keys(input.query).length > 0 ? { query: input.query } : {}),
            ...(input.interfaceDescription?.trim() ? { interfaceDescription: input.interfaceDescription.trim() } : {}),
            ...(parameterContract ? { parameterContract } : {}),
        };
    }
    else if (targetType === "ssh") {
        config = {
            kind: "ssh",
            preset: "server-resource-status",
            operation: "server-resource-status",
            lookup: "server_lookup",
            executor: "ssh_executor",
            command: input.command?.trim(),
        };
    }
    else if (targetType === "openclaw") {
        executionMode = "OPENCLAW";
        config = {
            kind: "openclaw",
            systemPrompt: input.systemPrompt?.trim(),
            allowedTools: input.allowedTools || [],
            orchestration: { mode: "serial" },
        };
    }
    else if (targetType === "template") {
        config = {
            kind: "template",
            prompt: input.prompt?.trim(),
        };
    }
    const validationInput = input.testInput || {
        ...(config.query ? { query: config.query } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
    };
    return {
        missingFields,
        config,
        validationInput,
        skillPayload: {
            name,
            description,
            type: "EXTENSION",
            executionMode,
            configuration: JSON.stringify(config),
            enabled: input.enabled ?? true,
            requiresConfirmation: input.requiresConfirmation ?? false,
            visibility: "PRIVATE",
        },
    };
}
function toQueryRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return Object.entries(value).reduce((acc, [key, item]) => {
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            acc[key] = item;
        }
        return acc;
    }, {});
}
function buildUrlWithQuery(endpoint, query) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
    }
    return url.toString();
}
async function executeCurrentTimeSkill(gatewayUrl, apiToken, config) {
    const endpoint = config.endpoint || "https://vv.video.qq.com/checktime?otype=json";
    const method = (config.method || "GET").toUpperCase();
    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/api`, {
        url: endpoint,
        method,
        headers: {},
        body: "",
    }, {
        headers: {
            "X-Agent-Token": apiToken,
            "Content-Type": "application/json",
        },
    });
    const parsed = parseCheckTimePayload(response.data);
    if (!parsed) {
        return JSON.stringify({
            error: "Failed to parse current time response",
            raw: response.data,
        });
    }
    return JSON.stringify({
        timestamp: parsed.timestamp,
        readableTime: parsed.isoTime,
    });
}
async function executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, input, config) {
    const payload = input ? JSON.parse(input) : {};
    const serverName = payload.serverName || payload.name;
    const command = config.command || payload.command;
    if (!command) {
        return JSON.stringify({ error: "No command configured for server-resource-status skill" });
    }
    const headers = {
        "X-Agent-Token": apiToken,
        "Content-Type": "application/json",
    };
    if (userId) {
        headers["X-User-Id"] = userId;
    }
    let host = payload.host;
    if (!host && serverName && userId) {
        const lookupResponse = await axios_1.default.get(`${gatewayUrl}/api/skills/server-lookup`, {
            headers,
            params: { name: serverName },
        });
        host = lookupResponse.data.ip;
    }
    if (!host) {
        return JSON.stringify({
            error: "Missing server host. Provide host or serverName (with authenticated user context).",
        });
    }
    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/ssh`, {
        host,
        command,
        confirmed: true,
    }, { headers });
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}
async function executeConfiguredApiSkill(gatewayUrl, apiToken, input, config) {
    const method = (config.method || "GET").toUpperCase();
    let payload = parseToolInput(input);
    payload = normalizeApiSkillPayload(payload);
    const defaults = collectParameterDefaults(config.parameterContract);
    const merged = { ...defaults, ...payload };
    if (config.parameterContract && config.parameterContract.type === "object" && config.parameterContract.properties) {
        const validate = ajv.compile(config.parameterContract);
        const valid = validate(merged);
        if (!valid) {
            const errors = validate.errors?.map(err => {
                const path = err.instancePath ? `'${err.instancePath.substring(1)}' ` : '';
                return `${path}${err.message}`;
            }) || ["Unknown validation error"];
            return JSON.stringify({
                error: "Parameter validation failed",
                details: errors,
                expectedContract: config.parameterContract,
                ...(config.interfaceDescription?.trim()
                    ? { interfaceDescription: config.interfaceDescription.trim() }
                    : {}),
                hint: "Do not use empty strings as placeholders for required fields. Omit keys or use valid values per the contract, then call this tool again. "
                    + "Defaults from the skill parameter contract are applied when a key is omitted.",
            });
        }
    }
    const query = {
        ...toQueryRecord(config.query),
        ...toQueryRecord(merged.query),
    };
    for (const [key, value] of Object.entries(merged)) {
        if (["query", "headers", "body"].includes(key))
            continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            query[key] = value;
        }
    }
    const endpoint = config.endpoint ? buildUrlWithQuery(config.endpoint, query) : "";
    if (!endpoint) {
        return JSON.stringify({ error: "No endpoint configured for API skill" });
    }
    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/api`, {
        url: endpoint,
        method,
        headers: config.headers || {},
        body: merged.body ?? "",
    }, {
        headers: {
            "X-Agent-Token": apiToken,
            "Content-Type": "application/json",
        },
    });
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}
async function invokeToolDirect(tool, input) {
    const callableTool = tool;
    let rawResult;
    if ((0, tools_1.isStructuredTool)(tool)) {
        const parsed = typeof input === "string"
            ? JSON.parse(input.trim() || "{}")
            : input !== undefined && input !== null && typeof input === "object"
                ? input
                : {};
        rawResult = await tool.invoke(parsed);
    }
    else {
        const serializedInput = typeof input === "string" ? input : JSON.stringify(input ?? {});
        rawResult = callableTool.func
            ? await callableTool.func(serializedInput)
            : await callableTool.invoke(serializedInput);
    }
    if (typeof rawResult === "string")
        return rawResult;
    if (rawResult && typeof rawResult === "object") {
        const c = rawResult.content;
        if (typeof c === "string")
            return c;
    }
    return JSON.stringify(rawResult ?? "");
}
function summarizeToolResult(result) {
    const trimmed = result.trim();
    if (!trimmed)
        return undefined;
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
            if (typeof parsed.error === "string") {
                return String(parsed.error);
            }
            if (typeof parsed.result === "string") {
                return String(parsed.result);
            }
            if (typeof parsed.readableTime === "string") {
                return String(parsed.readableTime);
            }
        }
    }
    catch {
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}
function resolveAllowedTools(allowedTools, toolLookup) {
    const names = Array.isArray(allowedTools) ? allowedTools : [];
    const resolved = names
        .map((name) => toolLookup.get(name) ?? toolLookup.get(name.trim()) ?? toolLookup.get(name.replace(/-/g, "_")))
        .filter(Boolean);
    const deduped = new Map();
    resolved.forEach((tool) => deduped.set(tool.name, tool));
    return Array.from(deduped.values());
}
async function executeOpenClawSkill(plannerModel, parentToolName, input, config, availableTools) {
    const orchestrationMode = config.orchestration?.mode || "serial";
    if (orchestrationMode !== "serial") {
        return JSON.stringify({ error: `Unsupported OPENCLAW orchestration mode: ${orchestrationMode}` });
    }
    const availableToolLookup = new Map();
    availableTools.forEach((tool) => {
        availableToolLookup.set(tool.name, tool);
        availableToolLookup.set(tool.name.replace(/_/g, "-"), tool);
        availableToolLookup.set(tool.name.replace(/-/g, "_"), tool);
        const metadata = describeGatewayExtendedTool(tool.name);
        if (metadata?.displayName) {
            availableToolLookup.set(metadata.displayName, tool);
        }
    });
    const allowedTools = resolveAllowedTools(config.allowedTools, availableToolLookup);
    const missingTools = (config.allowedTools || []).filter((name) => (!availableToolLookup.get(name)
        && !availableToolLookup.get(name.trim())
        && !availableToolLookup.get(name.replace(/-/g, "_"))));
    if (missingTools.length > 0) {
        return JSON.stringify({ error: `OPENCLAW skill is missing required tools: ${missingTools.join(", ")}` });
    }
    const parentToolId = (0, tool_trace_context_1.getActiveParentToolId)(parentToolName);
    const planner = allowedTools.length > 0
        ? (plannerModel && typeof plannerModel.bindTools === "function" ? plannerModel.bindTools(allowedTools) : null)
        : plannerModel;
    if (!planner || typeof planner.invoke !== "function") {
        return JSON.stringify({ error: "OPENCLAW planner model is unavailable." });
    }
    const systemPrompt = [
        config.systemPrompt || "You are an autonomous planning skill.",
        "You MUST call exactly ONE tool per turn, in order. Never emit multiple tool_calls in a single response.",
        "Do not skip required tool calls.",
        "For the compute tool, use structured arguments: operation (enum) and operands (array)—see tool schema. Do not nest under an input key.",
        "If the user's input is ambiguous or cannot be reliably parsed, ask a clarification question instead of guessing.",
    ].join("\n\n");
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input || "{}" },
    ];
    for (let round = 0; round < 6; round += 1) {
        const response = await planner.invoke(messages);
        const rawToolCalls = Array.isArray(response?.tool_calls) ? response.tool_calls : [];
        let toolCalls = rawToolCalls;
        if (orchestrationMode === "serial" && rawToolCalls.length > 1) {
            toolCalls = [rawToolCalls[0]];
            messages.push(new messages_1.AIMessage({
                content: response.content ?? "",
                tool_calls: toolCalls,
            }));
        }
        else {
            messages.push(response);
        }
        if (toolCalls.length === 0) {
            const content = response?.content;
            if (typeof content === "string")
                return content;
            if (Array.isArray(content)) {
                return content
                    .map((part) => typeof part === "string" ? part : part?.text || "")
                    .join("");
            }
            return JSON.stringify(content ?? "");
        }
        for (const toolCall of toolCalls) {
            const tool = allowedTools.find((candidate) => candidate.name === toolCall.name);
            if (!tool) {
                return JSON.stringify({ error: `OPENCLAW skill tried to call unauthorized tool: ${toolCall.name}` });
            }
            const childToolId = typeof toolCall.id === "string" && toolCall.id.trim()
                ? toolCall.id
                : `${parentToolName}:${tool.name}:${round}`;
            const childDisplayName = describeGatewayExtendedTool(tool.name)?.displayName || tool.name;
            (0, tool_trace_context_1.emitToolTraceEvent)({
                type: "tool_status",
                toolId: childToolId,
                toolName: tool.name,
                displayName: childDisplayName,
                kind: describeGatewayExtendedTool(tool.name)?.kind || "tool",
                status: "running",
                parentToolId,
                parentToolName,
                arguments: (0, tool_trace_context_1.sanitizeToolTraceArguments)(toolCall.args || {}),
            });
            try {
                const result = await invokeToolDirect(tool, toolCall.args || {});
                (0, tool_trace_context_1.emitToolTraceEvent)({
                    type: "tool_status",
                    toolId: childToolId,
                    toolName: tool.name,
                    displayName: childDisplayName,
                    kind: describeGatewayExtendedTool(tool.name)?.kind || "tool",
                    status: "completed",
                    parentToolId,
                    parentToolName,
                    summary: summarizeToolResult(result),
                    result: (0, tool_trace_context_1.sanitizeToolResultForTrace)(result),
                });
                const resolvedCallId = typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : childToolId;
                messages.push({
                    role: "tool",
                    tool_call_id: resolvedCallId,
                    content: result,
                });
            }
            catch (error) {
                if ((0, langgraph_1.isGraphInterrupt)(error))
                    throw error;
                const message = formatToolError(error);
                (0, tool_trace_context_1.emitToolTraceEvent)({
                    type: "tool_status",
                    toolId: childToolId,
                    toolName: tool.name,
                    displayName: childDisplayName,
                    kind: describeGatewayExtendedTool(tool.name)?.kind || "tool",
                    status: "failed",
                    parentToolId,
                    parentToolName,
                    summary: message,
                    result: (0, tool_trace_context_1.sanitizeToolResultForTrace)(message),
                });
                const resolvedCallId = typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : childToolId;
                messages.push({
                    role: "tool",
                    tool_call_id: resolvedCallId,
                    content: JSON.stringify({ error: message }),
                });
            }
        }
    }
    return JSON.stringify({ error: "OPENCLAW skill exceeded the maximum planning steps." });
}
function gatewaySkillMutationHeaders(apiToken, userId) {
    const headers = {
        "X-Agent-Token": apiToken,
        "Content-Type": "application/json",
    };
    if (userId && String(userId).trim()) {
        headers["X-User-Id"] = String(userId).trim();
    }
    return headers;
}
function gatewaySkillReadHeaders(apiToken, userId) {
    const headers = {
        "X-Agent-Token": apiToken,
    };
    if (userId && String(userId).trim()) {
        headers["X-User-Id"] = String(userId).trim();
    }
    return headers;
}
function previewExtendedSkillToolInput(rawInput) {
    const t = (rawInput ?? "").trim();
    if (!t)
        return {};
    try {
        return JSON.parse(t);
    }
    catch {
        return rawInput;
    }
}
function parseExtendedSkillConfirmationInput(input) {
    const trimmed = (input ?? "").trim();
    if (!trimmed) {
        return { confirmed: false, executionInput: "" };
    }
    try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === "object" && !Array.isArray(obj) && "confirmed" in obj) {
            const confirmed = Boolean(obj.confirmed);
            const rest = { ...obj };
            delete rest.confirmed;
            const executionInput = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
            return { confirmed, executionInput };
        }
    }
    catch {
    }
    return { confirmed: false, executionInput: trimmed };
}
async function saveGeneratedSkill(gatewayUrl, apiToken, payload, allowOverwrite, userId) {
    const headers = gatewaySkillMutationHeaders(apiToken, userId);
    const readHeaders = gatewaySkillReadHeaders(apiToken, userId);
    try {
        const existingSkillsResponse = await axios_1.default.get(`${gatewayUrl}/api/skills`, { headers: readHeaders });
        const existingSkills = Array.isArray(existingSkillsResponse.data) ? existingSkillsResponse.data : [];
        const existingSkill = existingSkills.find((entry) => entry.name === payload.name);
        if (!existingSkill) {
            const created = await axios_1.default.post(`${gatewayUrl}/api/skills`, payload, { headers });
            return {
                mode: "created",
                skill: created.data,
            };
        }
        if (!allowOverwrite) {
            return {
                status: "conflict",
                error: `Skill "${payload.name}" already exists. Re-run with "allowOverwrite": true to update it.`,
            };
        }
        const owner = (existingSkill.createdBy || "").trim();
        const uid = userId ? String(userId).trim() : "";
        if (owner && uid && owner !== uid) {
            const platformAuthor = "public";
            const platformAdmin = "890728";
            const adminCanTakePlatform = owner === platformAuthor && uid === platformAdmin;
            if (!adminCanTakePlatform) {
                return {
                    status: "conflict",
                    error: `Skill "${payload.name}" is owned by another user and cannot be overwritten.`,
                };
            }
        }
        const updated = await axios_1.default.put(`${gatewayUrl}/api/skills/${existingSkill.id}`, payload, { headers });
        return {
            mode: "updated",
            skill: updated.data,
        };
    }
    catch (error) {
        return {
            status: "save_failed",
            error: formatToolError(error),
        };
    }
}
async function loadGatewayExtendedTools(gatewayUrl, apiToken, userId, options) {
    try {
        const listHeaders = gatewaySkillReadHeaders(apiToken, userId);
        const response = await axios_1.default.get(`${gatewayUrl}/api/skills`, {
            headers: listHeaders,
        });
        const skills = Array.isArray(response.data) ? response.data : [];
        const extensionSkills = skills.filter((skill) => skill.enabled && (skill.type || "").toUpperCase() === "EXTENSION");
        const toolLookup = new Map();
        (options?.availableTools || []).forEach((tool) => {
            toolLookup.set(tool.name, tool);
        });
        const resolvedTools = [];
        extensionSkills.forEach((skill) => {
            console.log(`[DEBUG] skill ${skill.id} configuration:`, skill.configuration);
            const config = skill.configuration ? parseSkillConfig(skill) : {};
            const toolName = normalizeToolName(skill.name || `skill_${skill.id}`, skill.id);
            registerGatewayToolMetadata(toolName, skill);
            let toolDescription = skill.description || `Execute extended skill: ${skill.name}`;
            toolDescription = appendParameterContractToToolDescription(toolDescription, config);
            if (skill.requiresConfirmation) {
                toolDescription +=
                    " If this skill requires confirmation, approval happens via the chat UI buttons only; do not instruct the user to type \"confirm\" or to send JSON with confirmed:true.";
            }
            const dynamicTool = new tools_1.DynamicTool({
                name: toolName,
                description: toolDescription,
                func: async (input, _runManager, runConfig) => {
                    try {
                        let currentSkill = skill;
                        let currentConfig = config;
                        if (!currentSkill.configuration) {
                            const detailResponse = await axios_1.default.get(`${gatewayUrl}/api/skills/${skill.id}`, {
                                headers: gatewaySkillReadHeaders(apiToken, userId),
                            });
                            currentSkill = detailResponse.data;
                            currentConfig = parseSkillConfig(currentSkill);
                        }
                        const executionMode = normalizeExecutionMode(currentSkill.executionMode);
                        const needsConfirmation = Boolean(currentSkill.requiresConfirmation);
                        let execInput = input;
                        if (needsConfirmation) {
                            const { confirmed, executionInput } = parseExtendedSkillConfirmationInput(input);
                            if (!confirmed) {
                                const tc = runConfig?.toolCall;
                                const toolCallId = (typeof tc?.id === "string" && tc.id.trim())
                                    ? tc.id.trim()
                                    : `${toolName}:pending`;
                                const resume = (0, langgraph_1.interrupt)({
                                    kind: "extended_skill_confirmation",
                                    toolName,
                                    toolCallId,
                                    skillName: currentSkill.name || toolName,
                                    skillId: currentSkill.id,
                                    summary: `Execute extended skill: ${currentSkill.name || toolName}`,
                                    details: "",
                                    parametersPreview: previewExtendedSkillToolInput(input),
                                });
                                if (!resume.confirmed) {
                                    return JSON.stringify({
                                        status: "CANCELLED",
                                        message: "User cancelled the skill execution.",
                                    });
                                }
                                execInput = parseExtendedSkillConfirmationInput(input).executionInput;
                            }
                            else {
                                execInput = executionInput;
                            }
                        }
                        if (isCurrentTimeSkillConfig(currentConfig)) {
                            return await executeCurrentTimeSkill(gatewayUrl, apiToken, currentConfig);
                        }
                        if (isServerMonitorSkillConfig(currentConfig)) {
                            return await executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, execInput, currentConfig);
                        }
                        if (executionMode === "OPENCLAW" || currentConfig.kind === "openclaw") {
                            return await executeOpenClawSkill(options?.plannerModel, toolName, execInput, currentConfig, Array.from(toolLookup.values()));
                        }
                        if ((currentConfig.kind || "").toLowerCase() === "template") {
                            const basePrompt = (currentConfig.prompt || "").trim();
                            const userPayload = typeof execInput === "string" ? execInput.trim() : "";
                            return JSON.stringify({
                                kind: "template",
                                prompt: basePrompt,
                                userInput: userPayload,
                                instruction: "The user's parameters are in userInput. Combine prompt with userInput and write the complete result "
                                    + "in your next assistant message as natural language. Do NOT call this tool again for the same request.",
                            });
                        }
                        if ((currentConfig.kind || "").toLowerCase() === "api" || currentConfig.operation === "api-request" || currentConfig.operation === "juhe-joke-list") {
                            if (hasApiProgressiveDisclosureMaterial(currentConfig) && isEmptyApiToolInput(execInput)) {
                                return JSON.stringify({
                                    status: "REQUIRE_PARAMETERS",
                                    message: "This is an API skill. Read the interface description and parameter contract, then call this tool again with the parameters you need to set. "
                                        + "Fields that have a default in the contract are filled in automatically if you omit them.",
                                    interfaceDescription: currentConfig.interfaceDescription?.trim()
                                        || "No separate interface description. Use the parameter contract and tool description above.",
                                    parameterContract: currentConfig.parameterContract
                                        ?? "No strict contract defined. Please infer from description.",
                                });
                            }
                            return await executeConfiguredApiSkill(gatewayUrl, apiToken, execInput, currentConfig);
                        }
                        if ((currentConfig.kind || "").toLowerCase() === "ssh") {
                            return JSON.stringify({
                                error: `Unsupported ssh preset for skill: ${readPreset(currentConfig) || "unknown"}`,
                            });
                        }
                        return JSON.stringify({
                            error: `Unsupported extended skill operation: ${currentConfig.operation || "unknown"}`,
                            skill: currentSkill.name,
                        });
                    }
                    catch (error) {
                        if ((0, langgraph_1.isGraphInterrupt)(error))
                            throw error;
                        return `Error executing extended skill "${skill.name}": ${formatToolError(error)}`;
                    }
                },
            });
            resolvedTools.push(dynamicTool);
            toolLookup.set(dynamicTool.name, dynamicTool);
            if (skill.name) {
                toolLookup.set(skill.name, dynamicTool);
            }
        });
        return resolvedTools;
    }
    catch (error) {
        console.error("[agent-core] Failed to load extended skills from gateway:", formatToolError(error));
        return [];
    }
}
function buildConfirmedToolInputString(args) {
    if (args === undefined || args === null) {
        return JSON.stringify({ confirmed: true });
    }
    if (typeof args === "object" && !Array.isArray(args)) {
        return JSON.stringify({ ...args, confirmed: true });
    }
    if (typeof args === "string") {
        const trimmed = args.trim();
        if (!trimmed)
            return JSON.stringify({ confirmed: true });
        try {
            const o = JSON.parse(trimmed);
            if (o && typeof o === "object" && !Array.isArray(o)) {
                return JSON.stringify({ ...o, confirmed: true });
            }
        }
        catch {
            return JSON.stringify({ confirmed: true, input: trimmed });
        }
        return JSON.stringify({ confirmed: true, input: trimmed });
    }
    return JSON.stringify({ confirmed: true, input: String(args) });
}
async function invokeExtendedSkillWithConfirmed(gatewayUrl, apiToken, userId, toolName, toolArguments, options) {
    const extendedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
        plannerModel: options.plannerModel,
        availableTools: options.availableTools,
    });
    const underscore = toolName.replace(/-/g, "_");
    const tool = extendedTools.find((t) => t.name === toolName)
        ?? extendedTools.find((t) => t.name === underscore);
    if (!tool) {
        return JSON.stringify({ error: `Extended skill tool not found: ${toolName}` });
    }
    const inputStr = buildConfirmedToolInputString(toolArguments);
    const raw = await tool.invoke(inputStr);
    return typeof raw === "string" ? raw : JSON.stringify(raw);
}
class JavaSkillGeneratorTool extends tools_1.DynamicStructuredTool {
    gatewayUrl;
    apiToken;
    userId;
    constructor(gatewayUrl, apiToken, userId) {
        super({
            name: "skill_generator",
            description: "Creates a NEW extension skill on SkillGateway—use ONLY after you have confirmed no existing tool (built-in, gateway extensions, or loadable filesystem skills) can fulfill the request, OR the user explicitly asked to add/create a new skill. " +
                "Provide targetType and the corresponding fields for that type (api, ssh, openclaw, or template). Do NOT wrap everything in a single JSON string under 'input'.",
            schema: skillGeneratorToolInputSchema,
            func: async (args) => {
                const params = args;
                const generated = buildGeneratedSkill(params);
                if (generated.missingFields.length > 0 || !generated.skillPayload || !generated.config) {
                    return JSON.stringify({
                        status: "INPUT_INCOMPLETE",
                        missingFields: generated.missingFields,
                        message: "Missing required skill fields. Provide the missing fields and try again.",
                    });
                }
                const saveResult = await saveGeneratedSkill(this.gatewayUrl, this.apiToken, generated.skillPayload, params.allowOverwrite ?? false, this.userId);
                if ("error" in saveResult) {
                    return JSON.stringify({
                        status: saveResult.status === "conflict" ? "SKILL_ALREADY_EXISTS" : "SAVE_FAILED",
                        message: saveResult.error,
                        proposedSkill: {
                            ...generated.skillPayload,
                            configuration: JSON.stringify(sanitizeConfigForDisplay(generated.config)),
                        },
                    });
                }
                let validationRaw = "";
                if (params.targetType === "api" || !params.targetType) {
                    validationRaw = await executeConfiguredApiSkill(this.gatewayUrl, this.apiToken, JSON.stringify(generated.validationInput || {}), generated.config);
                }
                else {
                    validationRaw = JSON.stringify({ success: true, message: "Validation skipped for non-API skill type." });
                }
                const validation = buildValidationSummary(validationRaw);
                return JSON.stringify({
                    status: validation.success ? "VALIDATION_SUCCEEDED" : "VALIDATION_FAILED",
                    saveAction: saveResult.mode,
                    skill: {
                        id: saveResult.skill.id,
                        name: saveResult.skill.name,
                        description: saveResult.skill.description,
                        type: saveResult.skill.type,
                        enabled: saveResult.skill.enabled,
                        requiresConfirmation: saveResult.skill.requiresConfirmation,
                        configuration: sanitizeConfigForDisplay(generated.config),
                    },
                    validationInput: generated.validationInput || {},
                    validation,
                });
            },
        });
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
        this.userId = userId;
    }
}
exports.JavaSkillGeneratorTool = JavaSkillGeneratorTool;
class JavaSshTool extends tools_1.DynamicStructuredTool {
    constructor(gatewayUrl, apiToken, userId) {
        super({
            name: "ssh_executor",
            description: "Executes a shell command on a remote server via SSH. " +
                "Provide host, username, command, and either privateKey or password as separate fields. " +
                "If an extension skill covers the same SSH capability, use that extension tool instead of this built-in. " +
                "Destructive commands are gated by the in-app confirmation UI; do not ask the user to type confirmation text.",
            schema: sshExecutorToolInputSchema,
            func: async (args, _runManager, runConfig) => {
                try {
                    const headers = {
                        "X-Agent-Token": apiToken,
                        "Content-Type": "application/json",
                    };
                    if (userId) {
                        headers["X-User-Id"] = userId;
                    }
                    const dangerousPattern = /rm\s+-rf|mkfs|dd\s+if=|shutdown|reboot/;
                    if (!args.confirmed && dangerousPattern.test(args.command)) {
                        const tc = runConfig?.toolCall;
                        const toolCallId = (typeof tc?.id === "string" && tc.id.trim())
                            ? tc.id.trim()
                            : "ssh_executor:pending";
                        const resume = (0, langgraph_1.interrupt)({
                            kind: "ssh_confirmation",
                            toolName: "ssh_executor",
                            toolCallId,
                            skillName: "SSH",
                            summary: `Execute potentially dangerous SSH command on ${args.host}`,
                            details: `Command: ${args.command}`,
                            parametersPreview: {
                                host: args.host,
                                username: args.username,
                                command: args.command,
                                hasPrivateKey: Boolean(args.privateKey?.trim()),
                                hasPassword: Boolean(args.password),
                            },
                        });
                        if (!resume.confirmed) {
                            return JSON.stringify({
                                status: "CANCELLED",
                                message: "User cancelled the SSH command.",
                            });
                        }
                    }
                    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/ssh`, args, { headers });
                    return response.data;
                }
                catch (error) {
                    if ((0, langgraph_1.isGraphInterrupt)(error))
                        throw error;
                    return `Error executing SSH command: ${formatToolError(error)}`;
                }
            },
        });
    }
}
exports.JavaSshTool = JavaSshTool;
class JavaComputeTool extends tools_1.DynamicStructuredTool {
    constructor(gatewayUrl, apiToken) {
        super({
            name: "compute",
            description: "Math and date operations via Skill Gateway. Supply operation and operands as separate fields (see parameter schema). "
                + "Gateway body is { operation, operands }—do not wrap them in an extra input string.",
            schema: computeToolInputSchema,
            func: async (args) => {
                try {
                    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/compute`, { operation: args.operation, operands: args.operands }, {
                        headers: {
                            "X-Agent-Token": apiToken,
                            "Content-Type": "application/json",
                        },
                    });
                    return JSON.stringify(response.data);
                }
                catch (error) {
                    return `Error executing compute: ${formatToolError(error)}`;
                }
            },
        });
    }
}
exports.JavaComputeTool = JavaComputeTool;
class JavaLinuxScriptTool extends tools_1.DynamicStructuredTool {
    constructor(gatewayUrl, apiToken) {
        super({
            name: "linux_script_executor",
            description: "Executes a shell command on a preconfigured Linux server. " +
                "Provide serverId and command as separate fields (do NOT wrap in a JSON string under 'input').",
            schema: linuxScriptToolInputSchema,
            func: async (args) => {
                try {
                    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/linux-script`, args, {
                        headers: {
                            "X-Agent-Token": apiToken,
                            "Content-Type": "application/json",
                        },
                    });
                    if (typeof response.data === "string") {
                        return response.data;
                    }
                    if (response.data && typeof response.data.result === "string") {
                        return response.data.result;
                    }
                    return JSON.stringify(response.data);
                }
                catch (error) {
                    return `Error executing linux script: ${formatToolError(error)}`;
                }
            },
        });
    }
}
exports.JavaLinuxScriptTool = JavaLinuxScriptTool;
class JavaServerLookupTool extends tools_1.DynamicStructuredTool {
    constructor(gatewayUrl, apiToken, userId) {
        super({
            name: "server_lookup",
            description: "Looks up server connection details (ip, username, etc) by the server's alias name. " +
                "Provide the 'name' field directly (do NOT wrap in a JSON string under 'input').",
            schema: serverLookupToolInputSchema,
            func: async (args) => {
                try {
                    const headers = {
                        "X-Agent-Token": apiToken,
                        "Content-Type": "application/json",
                    };
                    if (userId) {
                        headers["X-User-Id"] = userId;
                    }
                    const response = await axios_1.default.get(`${gatewayUrl}/api/skills/server-lookup`, {
                        headers,
                        params: { name: args.name },
                    });
                    return JSON.stringify(response.data);
                }
                catch (error) {
                    return `Error looking up server: ${formatToolError(error)}`;
                }
            },
        });
    }
}
exports.JavaServerLookupTool = JavaServerLookupTool;
class JavaApiTool extends tools_1.DynamicStructuredTool {
    constructor(gatewayUrl, apiToken) {
        super({
            name: "api_caller",
            description: "Calls an external API via the Java gateway. " +
                "Provide url, method, headers, and body as separate fields (do NOT wrap everything in a single JSON string under 'input'). " +
                "If an extension skill covers the same HTTP capability, use that extension tool instead of this built-in.",
            schema: apiCallerToolInputSchema,
            func: async (args) => {
                try {
                    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/api`, args, {
                        headers: {
                            "X-Agent-Token": apiToken,
                            "Content-Type": "application/json",
                        },
                    });
                    return JSON.stringify(response.data);
                }
                catch (error) {
                    return `Error calling API: ${formatToolError(error)}`;
                }
            },
        });
    }
}
exports.JavaApiTool = JavaApiTool;
//# sourceMappingURL=java-skills.js.map