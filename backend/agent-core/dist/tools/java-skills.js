"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavaApiTool = exports.JavaServerLookupTool = exports.JavaLinuxScriptTool = exports.JavaComputeTool = exports.JavaSshTool = exports.JavaSkillGeneratorTool = void 0;
exports.describeGatewayExtendedTool = describeGatewayExtendedTool;
exports.loadGatewayExtendedTools = loadGatewayExtendedTools;
const messages_1 = require("@langchain/core/messages");
const tools_1 = require("@langchain/core/tools");
const axios_1 = __importDefault(require("axios"));
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
    const normalized = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized ? `extended_${normalized}` : `extended_skill_${id}`;
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
function parseSkillConfig(skill) {
    if (!skill.configuration || !skill.configuration.trim())
        return {};
    try {
        const parsed = JSON.parse(skill.configuration);
        return (parsed && typeof parsed === "object") ? parsed : {};
    }
    catch {
        return {};
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
    return name;
}
function sanitizeConfigForDisplay(config) {
    if (!config.apiKey)
        return config;
    return {
        ...config,
        apiKey: "***",
    };
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
        if (typeof input.apiKeyField === "string" && input.apiKeyField.trim() && !input.apiKey?.trim()) {
            missingFields.push("apiKey");
        }
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
    else {
        missingFields.push("targetType(api|ssh|openclaw)");
    }
    if (missingFields.length > 0) {
        return { missingFields };
    }
    const name = deriveSkillName({ ...input, targetType });
    const description = deriveSkillDescription({ ...input, targetType }, name);
    let config = {};
    let executionMode = "CONFIG";
    if (targetType === "api") {
        config = {
            kind: "api",
            operation: normalizeGeneratedOperation(name),
            method: input.method?.trim().toUpperCase(),
            endpoint: input.endpoint?.trim(),
            headers: input.headers || {},
            query: input.query || {},
        };
        if (typeof input.apiKeyField === "string" && input.apiKeyField.trim()) {
            config.apiKeyField = input.apiKeyField.trim();
        }
        if (typeof input.apiKey === "string" && input.apiKey.trim()) {
            config.apiKey = input.apiKey.trim();
        }
        if (typeof input.autoTimestampField === "string" && input.autoTimestampField.trim()) {
            config.autoTimestampField = input.autoTimestampField.trim();
        }
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
            systemPrompt: input.systemPrompt?.trim(),
            allowedTools: input.allowedTools || [],
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
    const payload = parseToolInput(input);
    const query = {
        ...toQueryRecord(config.query),
        ...toQueryRecord(payload.query),
    };
    for (const [key, value] of Object.entries(payload)) {
        if (["query", "headers", "body"].includes(key))
            continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            query[key] = value;
        }
    }
    if (config.autoTimestampField && query[config.autoTimestampField] === undefined) {
        query[config.autoTimestampField] = Math.floor(Date.now() / 1000);
    }
    if (config.apiKeyField) {
        const apiKey = typeof payload.apiKey === "string" && payload.apiKey.trim()
            ? payload.apiKey.trim()
            : config.apiKey;
        if (!apiKey || apiKey.includes("__")) {
            return JSON.stringify({
                error: `Missing API key for configured skill. Provide "apiKey" in tool input or update config.${config.apiKeyField}.`,
            });
        }
        query[config.apiKeyField] = apiKey;
    }
    const endpoint = config.endpoint ? buildUrlWithQuery(config.endpoint, query) : "";
    if (!endpoint) {
        return JSON.stringify({ error: "No endpoint configured for API skill" });
    }
    const response = await axios_1.default.post(`${gatewayUrl}/api/skills/api`, {
        url: endpoint,
        method,
        headers: config.headers || {},
        body: payload.body ?? "",
    }, {
        headers: {
            "X-Agent-Token": apiToken,
            "Content-Type": "application/json",
        },
    });
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}
async function invokeToolDirect(tool, input) {
    const serializedInput = typeof input === "string" ? input : JSON.stringify(input ?? {});
    const callableTool = tool;
    const rawResult = callableTool.func
        ? await callableTool.func(serializedInput)
        : await callableTool.invoke(serializedInput);
    if (typeof rawResult === "string")
        return rawResult;
    if (rawResult && typeof rawResult === "object" && typeof rawResult.content === "string") {
        return rawResult.content;
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
        "For the compute tool, pass JSON with top-level fields operation and operands only (e.g. date_diff_days with two YYYY-MM-DD strings). Do not nest under an input key.",
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
                });
                const resolvedCallId = typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : childToolId;
                messages.push({
                    role: "tool",
                    tool_call_id: resolvedCallId,
                    content: result,
                });
            }
            catch (error) {
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
async function saveGeneratedSkill(gatewayUrl, apiToken, payload, allowOverwrite) {
    const headers = {
        "X-Agent-Token": apiToken,
        "Content-Type": "application/json",
    };
    try {
        const existingSkillsResponse = await axios_1.default.get(`${gatewayUrl}/api/skills`);
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
        const response = await axios_1.default.get(`${gatewayUrl}/api/skills`, {
            headers: {
                "X-Agent-Token": apiToken,
            },
        });
        const skills = Array.isArray(response.data) ? response.data : [];
        const extensionSkills = skills.filter((skill) => skill.enabled && (skill.type || "").toUpperCase() === "EXTENSION");
        const toolLookup = new Map();
        (options?.availableTools || []).forEach((tool) => {
            toolLookup.set(tool.name, tool);
        });
        const resolvedTools = [];
        extensionSkills.forEach((skill) => {
            const config = parseSkillConfig(skill);
            const toolName = normalizeToolName(skill.name || `skill_${skill.id}`, skill.id);
            registerGatewayToolMetadata(toolName, skill);
            const dynamicTool = new tools_1.DynamicTool({
                name: toolName,
                description: skill.description || `Execute extended skill: ${skill.name}`,
                func: async (input) => {
                    try {
                        const executionMode = normalizeExecutionMode(skill.executionMode);
                        if (isCurrentTimeSkillConfig(config)) {
                            return await executeCurrentTimeSkill(gatewayUrl, apiToken, config);
                        }
                        if (isServerMonitorSkillConfig(config)) {
                            return await executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, input, config);
                        }
                        if (executionMode === "OPENCLAW" || config.kind === "openclaw") {
                            return await executeOpenClawSkill(options?.plannerModel, toolName, input, config, Array.from(toolLookup.values()));
                        }
                        if ((config.kind || "").toLowerCase() === "api" || config.operation === "api-request" || config.operation === "juhe-joke-list") {
                            return await executeConfiguredApiSkill(gatewayUrl, apiToken, input, config);
                        }
                        if ((config.kind || "").toLowerCase() === "ssh") {
                            return JSON.stringify({
                                error: `Unsupported ssh preset for skill: ${readPreset(config) || "unknown"}`,
                            });
                        }
                        return JSON.stringify({
                            error: `Unsupported extended skill operation: ${config.operation || "unknown"}`,
                            skill: skill.name,
                        });
                    }
                    catch (error) {
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
class JavaSkillGeneratorTool extends tools_1.Tool {
    name = "skill_generator";
    description = "Generates an EXTENSION skill (API, SSH, or OPENCLAW) from a user's description, saves it to SkillGateway, and immediately validates it once. Input must be a JSON string with 'targetType' (one of: 'api', 'ssh', 'openclaw'). For 'api', include 'method' and 'endpoint'. For 'ssh', include 'command' (saved as canonical kind=ssh with preset=server-resource-status, using server_lookup + ssh_executor; runtime input should provide serverName or host). For 'openclaw', include 'systemPrompt'. You can also include 'rawDescription', 'name', 'description', 'allowOverwrite', etc. If required fields are missing, do not guess; ask the user for them.";
    gatewayUrl;
    apiToken;
    constructor(gatewayUrl, apiToken) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
    }
    async _call(input) {
        const params = parseToolInput(input);
        const generated = buildGeneratedSkill(params);
        if (generated.missingFields.length > 0 || !generated.skillPayload || !generated.config) {
            return JSON.stringify({
                status: "INPUT_INCOMPLETE",
                missingFields: generated.missingFields,
                message: "Missing required skill fields. Provide the missing fields and try again.",
            });
        }
        const saveResult = await saveGeneratedSkill(this.gatewayUrl, this.apiToken, generated.skillPayload, params.allowOverwrite ?? false);
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
    }
}
exports.JavaSkillGeneratorTool = JavaSkillGeneratorTool;
class JavaSshTool extends tools_1.Tool {
    name = "ssh_executor";
    description = "Executes a shell command on a remote server via SSH. Input should be a JSON string with 'host', 'username', 'command', and either 'privateKey' or 'password', and optionally 'confirmed' (boolean). For safe/read-only commands, you can set 'confirmed': true to skip user confirmation. For destructive commands (e.g. rm, reboot), you MUST ask the user first.";
    gatewayUrl;
    apiToken;
    userId;
    constructor(gatewayUrl, apiToken, userId) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
        this.userId = userId;
    }
    async _call(input) {
        try {
            const params = JSON.parse(input);
            const dangerousPattern = /rm\s+-rf|mkfs|dd\s+if=|shutdown|reboot/;
            if (!params.confirmed && dangerousPattern.test(params.command)) {
                return JSON.stringify({
                    status: "CONFIRMATION_REQUIRED",
                    summary: `Execute potentially dangerous SSH command on ${params.host}`,
                    details: `Command: ${params.command}`,
                    instruction: "This command looks dangerous. Please ask the user to confirm this action. If they agree, call this tool again with 'confirmed': true."
                });
            }
            const headers = {
                "X-Agent-Token": this.apiToken,
                "Content-Type": "application/json",
            };
            if (this.userId) {
                headers["X-User-Id"] = this.userId;
            }
            const response = await axios_1.default.post(`${this.gatewayUrl}/api/skills/ssh`, params, { headers });
            return response.data;
        }
        catch (error) {
            return `Error executing SSH command: ${formatToolError(error)}`;
        }
    }
}
exports.JavaSshTool = JavaSshTool;
class JavaComputeTool extends tools_1.Tool {
    name = "compute";
    description = "Performs math and date operations. Supports: timestamp to YYYY-MM-DD, date_diff_days for two YYYY-MM-DD dates, add/subtract/multiply/divide, factorial, square, square root. Input: JSON with 'operation' (add|subtract|multiply|divide|factorial|square|sqrt|timestamp_to_date|date_diff_days) and 'operands' (array of numbers or date strings, depending on the operation).";
    gatewayUrl;
    apiToken;
    constructor(gatewayUrl, apiToken) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
    }
    async _call(input) {
        try {
            let params = JSON.parse(input);
            if (params && typeof params === "object" && !params.operation && params.input != null) {
                const raw = params.input;
                try {
                    const inner = typeof raw === "string"
                        ? JSON.parse(raw)
                        : raw;
                    if (inner && typeof inner === "object" && typeof inner.operation === "string") {
                        params = inner;
                    }
                }
                catch {
                }
            }
            const response = await axios_1.default.post(`${this.gatewayUrl}/api/skills/compute`, params, {
                headers: {
                    "X-Agent-Token": this.apiToken,
                    "Content-Type": "application/json",
                },
            });
            return JSON.stringify(response.data);
        }
        catch (error) {
            return `Error executing compute: ${formatToolError(error)}`;
        }
    }
}
exports.JavaComputeTool = JavaComputeTool;
class JavaLinuxScriptTool extends tools_1.Tool {
    name = "linux_script_executor";
    description = "Executes a shell command on a preconfigured Linux server. Input should be a JSON string with 'serverId' and 'command'. Returns the command output.";
    gatewayUrl;
    apiToken;
    constructor(gatewayUrl, apiToken) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
    }
    async _call(input) {
        try {
            const params = JSON.parse(input);
            const response = await axios_1.default.post(`${this.gatewayUrl}/api/skills/linux-script`, params, {
                headers: {
                    "X-Agent-Token": this.apiToken,
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
    }
}
exports.JavaLinuxScriptTool = JavaLinuxScriptTool;
class JavaServerLookupTool extends tools_1.Tool {
    name = "server_lookup";
    description = "Looks up server connection details (ip, username) by the server's alias name. Input should be a JSON string with 'name'.";
    gatewayUrl;
    apiToken;
    userId;
    constructor(gatewayUrl, apiToken, userId) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
        this.userId = userId;
    }
    async _call(input) {
        try {
            const params = JSON.parse(input);
            const headers = {
                "X-Agent-Token": this.apiToken,
                "Content-Type": "application/json",
            };
            if (this.userId) {
                headers["X-User-Id"] = this.userId;
            }
            const response = await axios_1.default.get(`${this.gatewayUrl}/api/skills/server-lookup`, {
                headers,
                params: { name: params.name }
            });
            return JSON.stringify(response.data);
        }
        catch (error) {
            return `Error looking up server: ${formatToolError(error)}`;
        }
    }
}
exports.JavaServerLookupTool = JavaServerLookupTool;
class JavaApiTool extends tools_1.Tool {
    name = "api_caller";
    description = "Calls an external API via the Java gateway. Input should be a JSON string with 'url', 'method', 'headers', and 'body'.";
    gatewayUrl;
    apiToken;
    constructor(gatewayUrl, apiToken) {
        super();
        this.gatewayUrl = gatewayUrl;
        this.apiToken = apiToken;
    }
    async _call(input) {
        try {
            const params = JSON.parse(input);
            const response = await axios_1.default.post(`${this.gatewayUrl}/api/skills/api`, params, {
                headers: {
                    "X-Agent-Token": this.apiToken,
                    "Content-Type": "application/json",
                },
            });
            return JSON.stringify(response.data);
        }
        catch (error) {
            return `Error calling API: ${formatToolError(error)}`;
        }
    }
}
exports.JavaApiTool = JavaApiTool;
//# sourceMappingURL=java-skills.js.map