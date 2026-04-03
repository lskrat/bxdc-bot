import { AIMessage } from "@langchain/core/messages";
import { DynamicTool, Tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import {
  emitToolTraceEvent,
  getActiveParentToolId,
  sanitizeToolTraceArguments,
} from "./tool-trace-context";

function formatToolError(error: unknown): string {
  if (axios.isAxiosError(error)) {
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
      } catch {
        return `${baseMessage}${statusPart}`;
      }
    }
    return `${baseMessage}${statusPart}`;
  }

  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

interface GatewaySkill {
  id: number;
  name: string;
  description?: string;
  type?: string;
  executionMode?: string;
  configuration?: string;
  enabled?: boolean;
  requiresConfirmation?: boolean;
}

interface SkillMutationPayload {
  name: string;
  description: string;
  type: "EXTENSION";
  executionMode?: "CONFIG" | "OPENCLAW";
  configuration: string;
  enabled: boolean;
  requiresConfirmation: boolean;
}

interface ExtendedSkillConfig {
  kind?: string;
  preset?: string;
  profile?: string;
  operation?: string;
  lookup?: string;
  executor?: string;
  method?: string;
  endpoint?: string;
  command?: string;
  systemPrompt?: string;
  inputGuidance?: string;
  allowedTools?: string[];
  orchestration?: {
    mode?: string;
  };
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  // New fields for refactored API Skill flow
  interfaceDescription?: string;
  parameterContract?: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
      enum?: string[];
      default?: any;
    }>;
  };
}

function readPreset(config: ExtendedSkillConfig): string | undefined {
  const value = config.preset ?? config.profile;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function isCurrentTimeSkillConfig(config: ExtendedSkillConfig): boolean {
  const kind = (config.kind || "").toLowerCase();
  const operation = (config.operation || "").toLowerCase();
  const preset = (readPreset(config) || "").toLowerCase();
  return (
    kind === "time" // legacy
    || (kind === "api" && (preset === "current-time" || operation === "current-time"))
    || operation === "current-time"
  );
}

function isServerMonitorSkillConfig(config: ExtendedSkillConfig): boolean {
  const kind = (config.kind || "").toLowerCase();
  const operation = (config.operation || "").toLowerCase();
  const preset = (readPreset(config) || "").toLowerCase();
  return (
    kind === "monitor" // legacy
    || (kind === "ssh" && (preset === "server-resource-status" || operation === "server-resource-status"))
    || operation === "server-resource-status"
  );
}

interface SkillGeneratorInput {
  targetType?: "api" | "ssh" | "openclaw";
  rawDescription?: string;
  name?: string;
  description?: string;
  // API specific
  method?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  interfaceDescription?: string;
  parameterContract?: any;
  // SSH specific
  command?: string;
  // OPENCLAW specific
  systemPrompt?: string;
  allowedTools?: string[];
  // Common
  testInput?: Record<string, unknown>;
  enabled?: boolean;
  requiresConfirmation?: boolean;
  allowOverwrite?: boolean;
}

interface GatewayToolMetadata {
  displayName: string;
  executionMode?: string;
  executionLabel?: string;
}

const gatewayExtendedToolRegistry = new Map<string, GatewayToolMetadata>();
const gatewayExtendedToolIdRegistry = new Map<number, GatewayToolMetadata>();

function normalizeToolName(name: string, id: number): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized ? `extended_${normalized}` : `extended_skill_${id}`;
}

function normalizeExecutionMode(executionMode?: string): "CONFIG" | "OPENCLAW" {
  return executionMode?.toUpperCase() === "OPENCLAW" ? "OPENCLAW" : "CONFIG";
}

function localizeExecutionMode(executionMode?: string): "预配置" | "自主规划" {
  return normalizeExecutionMode(executionMode) === "OPENCLAW" ? "自主规划" : "预配置";
}

function registerGatewayToolMetadata(toolName: string, skill: GatewaySkill) {
  const metadata: GatewayToolMetadata = {
    displayName: skill.name || `skill_${skill.id}`,
    executionMode: normalizeExecutionMode(skill.executionMode),
    executionLabel: localizeExecutionMode(skill.executionMode),
  };

  gatewayExtendedToolRegistry.set(toolName, metadata);
  gatewayExtendedToolRegistry.set(toolName.replace(/_/g, "-"), metadata);
  gatewayExtendedToolIdRegistry.set(skill.id, metadata);
}

export function describeGatewayExtendedTool(toolName: string): { displayName: string; kind: 'skill' | 'tool'; executionMode?: string; executionLabel?: string } | null {
  const metadata =
    gatewayExtendedToolRegistry.get(toolName)
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

  // Fallback: resolve by trailing numeric id (e.g. extended-skill-1 / extended_skill_1)
  const idMatch = toolName.match(/(\d+)$/);
  if (!idMatch) return null;
  const skillId = Number(idMatch[1]);
  if (!Number.isFinite(skillId)) return null;
  const idDisplayName = gatewayExtendedToolIdRegistry.get(skillId);
  if (!idDisplayName) return null;
  return {
    displayName: idDisplayName.displayName,
    kind: 'skill',
    executionMode: idDisplayName.executionMode,
    executionLabel: idDisplayName.executionLabel,
  };
}

function parseSkillConfig(skill: GatewaySkill): ExtendedSkillConfig {
  if (!skill.configuration || !skill.configuration.trim()) return {};
  try {
    const parsed = JSON.parse(skill.configuration);
    return (parsed && typeof parsed === "object") ? parsed as ExtendedSkillConfig : {};
  } catch {
    return {};
  }
}

function parseCheckTimePayload(payload: unknown): { timestamp: number; isoTime: string } | null {
  if (typeof payload === "string") {
    const match = payload.match(/QZOutputJson=\{.*?"t"\s*:\s*"?(?<ts>\d{10,13})"?/);
    const tsRaw = match?.groups?.ts;
    if (!tsRaw) return null;
    const tsNum = Number(tsRaw);
    if (!Number.isFinite(tsNum)) return null;
    const timestampMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
    return { timestamp: tsNum, isoTime: new Date(timestampMs).toISOString() };
  }

  if (payload && typeof payload === "object") {
    const direct = (payload as Record<string, unknown>).t;
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

function parseToolInput(input: string): Record<string, unknown> {
  if (!input?.trim()) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeGeneratedOperation(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "api_request";
}

function deriveSkillName(input: SkillGeneratorInput): string {
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
      if (candidate) return `API ${candidate}`;
    } catch {
      // Ignore invalid endpoint here, validation happens separately.
    }
  }

  if (input.targetType === "ssh" && typeof input.command === "string" && input.command.trim()) {
    const firstWord = input.command.trim().split(/\s+/)[0];
    if (firstWord) return `SSH ${firstWord}`;
  }

  if (input.targetType === "openclaw") {
    return "Generated OPENCLAW Skill";
  }

  return "Generated Skill";
}

function deriveSkillDescription(input: SkillGeneratorInput, name: string): string {
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

function sanitizeConfigForDisplay(config: ExtendedSkillConfig): ExtendedSkillConfig {
  return config;
}

function buildValidationSummary(result: string): {
  success: boolean;
  parsed?: unknown;
  raw?: string;
  error?: string;
} {
  if (result.startsWith("Error ")) {
    return {
      success: false,
      error: result,
    };
  }

  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
      return {
        success: false,
        parsed,
        error: String((parsed as Record<string, unknown>).error || "Validation failed"),
      };
    }

    return {
      success: true,
      parsed,
    };
  } catch {
    return {
      success: true,
      raw: result,
    };
  }
}

function buildGeneratedSkill(input: SkillGeneratorInput): {
  missingFields: string[];
  skillPayload?: SkillMutationPayload;
  config?: ExtendedSkillConfig;
  validationInput?: Record<string, unknown>;
} {
  const missingFields: string[] = [];
  const targetType = input.targetType || "api";

  if (targetType === "api") {
    const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
    const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : "";

    if (!endpoint) missingFields.push("endpoint");
    if (!method) missingFields.push("method");
    if (!input.interfaceDescription?.trim()) missingFields.push("interfaceDescription");
    if (!input.parameterContract) missingFields.push("parameterContract");

    if (endpoint) {
      try {
        new URL(endpoint);
      } catch {
        missingFields.push("endpoint(valid URL)");
      }
    }
  } else if (targetType === "ssh") {
    if (!input.command?.trim()) {
      missingFields.push("command");
    }
  } else if (targetType === "openclaw") {
    if (!input.systemPrompt?.trim()) {
      missingFields.push("systemPrompt");
    }
  } else {
    missingFields.push("targetType(api|ssh|openclaw)");
  }

  if (missingFields.length > 0) {
    return { missingFields };
  }

  const name = deriveSkillName({ ...input, targetType });
  const description = deriveSkillDescription({ ...input, targetType }, name);
  let config: ExtendedSkillConfig = {};
  let executionMode: "CONFIG" | "OPENCLAW" = "CONFIG";

  if (targetType === "api") {
    config = {
      kind: "api",
      operation: normalizeGeneratedOperation(name),
      method: input.method?.trim().toUpperCase(),
      endpoint: input.endpoint?.trim(),
      headers: input.headers || {},
      query: input.query || {},
      interfaceDescription: input.interfaceDescription?.trim(),
      parameterContract: input.parameterContract,
    };
  } else if (targetType === "ssh") {
    config = {
      kind: "ssh",
      preset: "server-resource-status",
      operation: "server-resource-status",
      lookup: "server_lookup",
      executor: "ssh_executor",
      command: input.command?.trim(),
    };
  } else if (targetType === "openclaw") {
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

function toQueryRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | number | boolean>>((acc, [key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      acc[key] = item;
    }
    return acc;
  }, {});
}

function buildUrlWithQuery(endpoint: string, query: Record<string, string | number | boolean>): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function executeCurrentTimeSkill(
  gatewayUrl: string,
  apiToken: string,
  config: ExtendedSkillConfig
): Promise<string> {
  const endpoint = config.endpoint || "https://vv.video.qq.com/checktime?otype=json";
  const method = (config.method || "GET").toUpperCase();
  const response = await axios.post(
    `${gatewayUrl}/api/skills/api`,
    {
      url: endpoint,
      method,
      headers: {},
      body: "",
    },
    {
      headers: {
        "X-Agent-Token": apiToken,
        "Content-Type": "application/json",
      },
    }
  );

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

async function executeServerResourceStatusSkill(
  gatewayUrl: string,
  apiToken: string,
  userId: string | undefined,
  input: string,
  config: ExtendedSkillConfig
): Promise<string> {
  const payload = input ? JSON.parse(input) : {};
  const serverName = payload.serverName || payload.name;
  const command = config.command || payload.command;

  if (!command) {
    return JSON.stringify({ error: "No command configured for server-resource-status skill" });
  }

  const headers: Record<string, string> = {
    "X-Agent-Token": apiToken,
    "Content-Type": "application/json",
  };
  if (userId) {
    headers["X-User-Id"] = userId;
  }

  let host = payload.host;
  if (!host && serverName && userId) {
    const lookupResponse = await axios.get(`${gatewayUrl}/api/skills/server-lookup`, {
      headers,
      params: { name: serverName },
    });
    host = (lookupResponse.data as Record<string, unknown>).ip;
  }

  if (!host) {
    return JSON.stringify({
      error: "Missing server host. Provide host or serverName (with authenticated user context).",
    });
  }

  const response = await axios.post(
    `${gatewayUrl}/api/skills/ssh`,
    {
      host,
      command,
      confirmed: true,
    },
    { headers }
  );
  return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}

async function executeConfiguredApiSkill(
  gatewayUrl: string,
  apiToken: string,
  input: string,
  config: ExtendedSkillConfig
): Promise<string> {
  const method = (config.method || "GET").toUpperCase();
  const payload = parseToolInput(input);

  // Validate payload against parameterContract if defined
  if (config.parameterContract && config.parameterContract.type === "object" && config.parameterContract.properties) {
    const errors: string[] = [];
    const validatedPayload: Record<string, any> = { ...payload };

    for (const [key, propConfig] of Object.entries(config.parameterContract.properties)) {
      let value = validatedPayload[key];

      // Apply default value if missing
      if (value === undefined && propConfig.default !== undefined) {
        value = propConfig.default;
        validatedPayload[key] = value;
      }

      // Check required
      if (propConfig.required && value === undefined) {
        errors.push(`Missing required parameter: '${key}'`);
        continue;
      }

      if (value !== undefined) {
        // Check type
        if (propConfig.type === "string" && typeof value !== "string") {
          errors.push(`Parameter '${key}' must be a string, got ${typeof value}`);
        } else if (propConfig.type === "number" && typeof value !== "number") {
          errors.push(`Parameter '${key}' must be a number, got ${typeof value}`);
        } else if (propConfig.type === "boolean" && typeof value !== "boolean") {
          errors.push(`Parameter '${key}' must be a boolean, got ${typeof value}`);
        }

        // Check enum
        if (propConfig.enum && Array.isArray(propConfig.enum)) {
          if (!propConfig.enum.includes(String(value))) {
            errors.push(`Parameter '${key}' must be one of [${propConfig.enum.join(", ")}], got '${value}'`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return JSON.stringify({
        error: "Parameter validation failed",
        details: errors,
        expectedContract: config.parameterContract,
      });
    }

    // Update payload with validated/defaulted values
    Object.assign(payload, validatedPayload);
  }

  const query = {
    ...toQueryRecord(config.query),
    ...toQueryRecord(payload.query),
  };

  for (const [key, value] of Object.entries(payload)) {
    if (["query", "headers", "body"].includes(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }

  const endpoint = config.endpoint ? buildUrlWithQuery(config.endpoint, query) : "";
  if (!endpoint) {
    return JSON.stringify({ error: "No endpoint configured for API skill" });
  }

  const response = await axios.post(
    `${gatewayUrl}/api/skills/api`,
    {
      url: endpoint,
      method,
      headers: config.headers || {},
      body: payload.body ?? "",
    },
    {
      headers: {
        "X-Agent-Token": apiToken,
        "Content-Type": "application/json",
      },
    }
  );

  return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}

async function invokeToolDirect(tool: DynamicTool | Tool, input: unknown): Promise<string> {
  const serializedInput = typeof input === "string" ? input : JSON.stringify(input ?? {});
  const callableTool = tool as any;
  const rawResult = callableTool.func
    ? await callableTool.func(serializedInput)
    : await callableTool.invoke(serializedInput);

  if (typeof rawResult === "string") return rawResult;
  if (rawResult && typeof rawResult === "object" && typeof rawResult.content === "string") {
    return rawResult.content;
  }

  return JSON.stringify(rawResult ?? "");
}

function summarizeToolResult(result: string): string | undefined {
  const trimmed = result.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      if (typeof (parsed as Record<string, unknown>).error === "string") {
        return String((parsed as Record<string, unknown>).error);
      }
      if (typeof (parsed as Record<string, unknown>).result === "string") {
        return String((parsed as Record<string, unknown>).result);
      }
      if (typeof (parsed as Record<string, unknown>).readableTime === "string") {
        return String((parsed as Record<string, unknown>).readableTime);
      }
    }
  } catch {
    // Ignore non-JSON outputs.
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function resolveAllowedTools(
  allowedTools: string[] | undefined,
  toolLookup: Map<string, DynamicTool | Tool>,
): Array<DynamicTool | Tool> {
  const names = Array.isArray(allowedTools) ? allowedTools : [];
  const resolved = names
    .map((name) => toolLookup.get(name) ?? toolLookup.get(name.trim()) ?? toolLookup.get(name.replace(/-/g, "_")))
    .filter(Boolean) as Array<DynamicTool | Tool>;

  const deduped = new Map<string, DynamicTool | Tool>();
  resolved.forEach((tool) => deduped.set(tool.name, tool));
  return Array.from(deduped.values());
}

async function executeOpenClawSkill(
  plannerModel: any,
  parentToolName: string,
  input: string,
  config: ExtendedSkillConfig,
  availableTools: Array<DynamicTool | Tool>,
): Promise<string> {
  const orchestrationMode = config.orchestration?.mode || "serial";
  if (orchestrationMode !== "serial") {
    return JSON.stringify({ error: `Unsupported OPENCLAW orchestration mode: ${orchestrationMode}` });
  }

  const availableToolLookup = new Map<string, DynamicTool | Tool>();
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
  const missingTools = (config.allowedTools || []).filter((name) => (
    !availableToolLookup.get(name)
    && !availableToolLookup.get(name.trim())
    && !availableToolLookup.get(name.replace(/-/g, "_"))
  ));
  if (missingTools.length > 0) {
    return JSON.stringify({ error: `OPENCLAW skill is missing required tools: ${missingTools.join(", ")}` });
  }

  const parentToolId = getActiveParentToolId(parentToolName);
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

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: input || "{}" },
  ];

  for (let round = 0; round < 6; round += 1) {
    const response = await planner.invoke(messages);
    const rawToolCalls = Array.isArray((response as any)?.tool_calls) ? (response as any).tool_calls : [];

    let toolCalls = rawToolCalls;
    if (orchestrationMode === "serial" && rawToolCalls.length > 1) {
      toolCalls = [rawToolCalls[0]];
      messages.push(
        new AIMessage({
          content: (response as AIMessage).content ?? "",
          tool_calls: toolCalls as any,
        }),
      );
    } else {
      messages.push(response);
    }

    if (toolCalls.length === 0) {
      const content = (response as any)?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part: any) => typeof part === "string" ? part : part?.text || "")
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
      emitToolTraceEvent({
        type: "tool_status",
        toolId: childToolId,
        toolName: tool.name,
        displayName: childDisplayName,
        kind: describeGatewayExtendedTool(tool.name)?.kind || "tool",
        status: "running",
        parentToolId,
        parentToolName,
        arguments: sanitizeToolTraceArguments(toolCall.args || {}),
      });

      try {
        const result = await invokeToolDirect(tool, toolCall.args || {});
        emitToolTraceEvent({
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
        const resolvedCallId =
          typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : childToolId;
        messages.push({
          role: "tool",
          tool_call_id: resolvedCallId,
          content: result,
        });
      } catch (error) {
        const message = formatToolError(error);
        emitToolTraceEvent({
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
        const resolvedCallId =
          typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : childToolId;
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

async function saveGeneratedSkill(
  gatewayUrl: string,
  apiToken: string,
  payload: SkillMutationPayload,
  allowOverwrite: boolean
): Promise<{ mode: "created" | "updated"; skill: GatewaySkill } | { error: string; status: "conflict" | "save_failed" }> {
  const headers = {
    "X-Agent-Token": apiToken,
    "Content-Type": "application/json",
  };

  try {
    const existingSkillsResponse = await axios.get(`${gatewayUrl}/api/skills`);
    const existingSkills = Array.isArray(existingSkillsResponse.data) ? existingSkillsResponse.data as GatewaySkill[] : [];
    const existingSkill = existingSkills.find((entry) => entry.name === payload.name);

    if (!existingSkill) {
      const created = await axios.post(`${gatewayUrl}/api/skills`, payload, { headers });
      return {
        mode: "created",
        skill: created.data as GatewaySkill,
      };
    }

    if (!allowOverwrite) {
      return {
        status: "conflict",
        error: `Skill "${payload.name}" already exists. Re-run with "allowOverwrite": true to update it.`,
      };
    }

    const updated = await axios.put(`${gatewayUrl}/api/skills/${existingSkill.id}`, payload, { headers });
    return {
      mode: "updated",
      skill: updated.data as GatewaySkill,
    };
  } catch (error) {
    return {
      status: "save_failed",
      error: formatToolError(error),
    };
  }
}

export async function loadGatewayExtendedTools(
  gatewayUrl: string,
  apiToken: string,
  userId?: string,
  options?: {
    plannerModel?: any;
    availableTools?: Array<DynamicTool | Tool>;
  },
): Promise<DynamicTool[]> {
  try {
    const response = await axios.get(`${gatewayUrl}/api/skills`, {
      headers: {
        "X-Agent-Token": apiToken,
      },
    });

    const skills = Array.isArray(response.data) ? response.data as GatewaySkill[] : [];
    const extensionSkills = skills.filter(
      (skill) => skill.enabled && (skill.type || "").toUpperCase() === "EXTENSION"
    );
    const toolLookup = new Map<string, DynamicTool | Tool>();
    (options?.availableTools || []).forEach((tool) => {
      toolLookup.set(tool.name, tool);
    });

    const resolvedTools: DynamicTool[] = [];
    extensionSkills.forEach((skill) => {
      const config = parseSkillConfig(skill);
      const toolName = normalizeToolName(skill.name || `skill_${skill.id}`, skill.id);
      registerGatewayToolMetadata(toolName, skill);

      const dynamicTool = new DynamicTool({
        name: toolName,
        description: skill.description || `Execute extended skill: ${skill.name}`,
        func: async (input: string) => {
          try {
            const executionMode = normalizeExecutionMode(skill.executionMode);
            if (isCurrentTimeSkillConfig(config)) {
              return await executeCurrentTimeSkill(gatewayUrl, apiToken, config);
            }
            if (isServerMonitorSkillConfig(config)) {
              return await executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, input, config);
            }
            if (executionMode === "OPENCLAW" || config.kind === "openclaw") {
              return await executeOpenClawSkill(
                options?.plannerModel,
                toolName,
                input,
                config,
                Array.from(toolLookup.values()),
              );
            }
            if ((config.kind || "").toLowerCase() === "api" || config.operation === "api-request" || config.operation === "juhe-joke-list") {
              if (config.interfaceDescription && (!input || input === "{}")) {
                // Progressive disclosure: If the LLM calls the tool without parameters (or empty {}),
                // we return the detailed interface description and parameter contract so it can call it again with the right parameters.
                return JSON.stringify({
                  status: "REQUIRE_PARAMETERS",
                  message: "This is an API skill. Please read the interface description and parameter contract, then call this tool again with the correct parameters.",
                  interfaceDescription: config.interfaceDescription,
                  parameterContract: config.parameterContract || "No strict contract defined. Please infer from description.",
                });
              }
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
          } catch (error) {
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
  } catch (error) {
    console.error("[agent-core] Failed to load extended skills from gateway:", formatToolError(error));
    return [];
  }
}

export class JavaSkillGeneratorTool extends Tool {
  name = "skill_generator";
  description = "Generates an EXTENSION skill (API, SSH, or OPENCLAW) from a user's description, saves it to SkillGateway, and immediately validates it once. Input must be a JSON string with 'targetType' (one of: 'api', 'ssh', 'openclaw'). For 'api', include 'method', 'endpoint', 'interfaceDescription' (detailed docs), and 'parameterContract' (JSON schema). For 'ssh', include 'command' (saved as canonical kind=ssh with preset=server-resource-status, using server_lookup + ssh_executor; runtime input should provide serverName or host). For 'openclaw', include 'systemPrompt'. You can also include 'rawDescription', 'name', 'description', 'allowOverwrite', etc. If required fields are missing, do not guess; ask the user for them.";

  private gatewayUrl: string;
  private apiToken: string;

  constructor(gatewayUrl: string, apiToken: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
  }

  async _call(input: string): Promise<string> {
    const params = parseToolInput(input) as SkillGeneratorInput;
    const generated = buildGeneratedSkill(params);

    if (generated.missingFields.length > 0 || !generated.skillPayload || !generated.config) {
      return JSON.stringify({
        status: "INPUT_INCOMPLETE",
        missingFields: generated.missingFields,
        message: "Missing required skill fields. Provide the missing fields and try again.",
      });
    }

    const saveResult = await saveGeneratedSkill(
      this.gatewayUrl,
      this.apiToken,
      generated.skillPayload,
      params.allowOverwrite ?? false
    );

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
      validationRaw = await executeConfiguredApiSkill(
        this.gatewayUrl,
        this.apiToken,
        JSON.stringify(generated.validationInput || {}),
        generated.config
      );
    } else {
      // For SSH and OPENCLAW, we don't automatically execute them during generation
      // as they might have side effects or require interactive input/confirmation.
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

/**
 * Java SSH 工具。
 * <p>
 * 封装对 Java Skill Gateway SSH 接口的调用。
 * 允许 Agent 在远程服务器上执行 Shell 命令。
 * </p>
 */
export class JavaSshTool extends Tool {
  name = "ssh_executor";
  description = "Executes a shell command on a remote server via SSH. Input should be a JSON string with 'host', 'username', 'command', and either 'privateKey' or 'password', and optionally 'confirmed' (boolean). For safe/read-only commands, you can set 'confirmed': true to skip user confirmation. For destructive commands (e.g. rm, reboot), you MUST ask the user first.";

  private gatewayUrl: string;
  private apiToken: string;
  private userId?: string;

  constructor(gatewayUrl: string, apiToken: string, userId?: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
    this.userId = userId;
  }

  /**
   * 调用工具。
   *
   * @param input JSON 格式的输入字符串，包含 host, username, privateKey, command
   * @returns 命令执行结果或错误信息
   */
  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      // Basic confirmation logic for SSH
      const dangerousPattern = /rm\s+-rf|mkfs|dd\s+if=|shutdown|reboot/;
      if (!params.confirmed && dangerousPattern.test(params.command)) {
        return JSON.stringify({
          status: "CONFIRMATION_REQUIRED",
          summary: `Execute potentially dangerous SSH command on ${params.host}`,
          details: `Command: ${params.command}`,
          instruction: "This command looks dangerous. Please ask the user to confirm this action. If they agree, call this tool again with 'confirmed': true."
        });
      }

      const headers: Record<string, string> = {
        "X-Agent-Token": this.apiToken,
        "Content-Type": "application/json",
      };
      if (this.userId) {
        headers["X-User-Id"] = this.userId;
      }

      const response = await axios.post(
        `${this.gatewayUrl}/api/skills/ssh`,
        params,
        { headers }
      );
      return response.data;
    } catch (error) {
      return `Error executing SSH command: ${formatToolError(error)}`;
    }
  }
}

/**
 * Java 计算工具。
 * <p>
 * 封装对 Java Skill Gateway 计算接口的调用。
 * 支持时间戳转日期、加减乘除、阶乘、平方、开方。
 * </p>
 */
export class JavaComputeTool extends Tool {
  name = "compute";
  description = "Performs math and date operations. Supports: timestamp to YYYY-MM-DD, date_diff_days for two YYYY-MM-DD dates, add/subtract/multiply/divide, factorial, square, square root. Input: JSON with 'operation' (add|subtract|multiply|divide|factorial|square|sqrt|timestamp_to_date|date_diff_days) and 'operands' (array of numbers or date strings, depending on the operation).";

  private gatewayUrl: string;
  private apiToken: string;

  constructor(gatewayUrl: string, apiToken: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
  }

  async _call(input: string): Promise<string> {
    try {
      let params = JSON.parse(input) as Record<string, unknown>;
      // Models often wrap the real payload as { "input": "{\"operation\":...}" } (DynamicTool-style).
      // Gateway expects top-level operation/operands; unwrap so we don't get "operation is required".
      if (params && typeof params === "object" && !params.operation && params.input != null) {
        const raw = params.input;
        try {
          const inner =
            typeof raw === "string"
              ? JSON.parse(raw) as Record<string, unknown>
              : (raw as Record<string, unknown>);
          if (inner && typeof inner === "object" && typeof inner.operation === "string") {
            params = inner;
          }
        } catch {
          // keep original params; gateway will validate
        }
      }
      const response = await axios.post(
        `${this.gatewayUrl}/api/skills/compute`,
        params,
        {
          headers: {
            "X-Agent-Token": this.apiToken,
            "Content-Type": "application/json",
          },
        }
      );
      return JSON.stringify(response.data);
    } catch (error) {
      return `Error executing compute: ${formatToolError(error)}`;
    }
  }
}

/**
 * Java Linux 脚本执行工具。
 * <p>
 * 封装对 Java Skill Gateway Linux 脚本接口的调用。
 * 允许 Agent 根据 serverId 在预配置服务器上执行命令。
 * </p>
 */
export class JavaLinuxScriptTool extends Tool {
  name = "linux_script_executor";
  description = "Executes a shell command on a preconfigured Linux server. Input should be a JSON string with 'serverId' and 'command'. Returns the command output.";

  private gatewayUrl: string;
  private apiToken: string;

  constructor(gatewayUrl: string, apiToken: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
  }

  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const response = await axios.post(
        `${this.gatewayUrl}/api/skills/linux-script`,
        params,
        {
          headers: {
            "X-Agent-Token": this.apiToken,
            "Content-Type": "application/json",
          },
        }
      );
      if (typeof response.data === "string") {
        return response.data;
      }
      if (response.data && typeof response.data.result === "string") {
        return response.data.result;
      }
      return JSON.stringify(response.data);
    } catch (error) {
      return `Error executing linux script: ${formatToolError(error)}`;
    }
  }
}

export class JavaServerLookupTool extends Tool {
  name = "server_lookup";
  description = "Looks up server connection details (ip, username) by the server's alias name. Input should be a JSON string with 'name'.";

  private gatewayUrl: string;
  private apiToken: string;
  private userId?: string;

  constructor(gatewayUrl: string, apiToken: string, userId?: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
    this.userId = userId;
  }

  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const headers: Record<string, string> = {
        "X-Agent-Token": this.apiToken,
        "Content-Type": "application/json",
      };
      if (this.userId) {
        headers["X-User-Id"] = this.userId;
      }

      const response = await axios.get(
        `${this.gatewayUrl}/api/skills/server-lookup`,
        { 
          headers,
          params: { name: params.name }
        }
      );
      return JSON.stringify(response.data);
    } catch (error) {
      return `Error looking up server: ${formatToolError(error)}`;
    }
  }
}

/**
 * Java API 工具。
 * <p>
 * 封装对 Java Skill Gateway API 代理接口的调用。
 * 允许 Agent 发起任意 HTTP 请求。
 * </p>
 */
export class JavaApiTool extends Tool {
  name = "api_caller";
  description = "Calls an external API via the Java gateway. Input should be a JSON string with 'url', 'method', 'headers', and 'body'.";

  private gatewayUrl: string;
  private apiToken: string;

  constructor(gatewayUrl: string, apiToken: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
  }

  /**
   * 调用工具。
   *
   * @param input JSON 格式的输入字符串，包含 url, method, headers, body
   * @returns API 响应内容的 JSON 字符串
   */
  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const response = await axios.post(
        `${this.gatewayUrl}/api/skills/api`,
        params,
        {
          headers: {
            "X-Agent-Token": this.apiToken,
            "Content-Type": "application/json",
          },
        }
      );
      return JSON.stringify(response.data);
    } catch (error) {
      return `Error calling API: ${formatToolError(error)}`;
    }
  }
}
