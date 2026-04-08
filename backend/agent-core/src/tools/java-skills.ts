import { AIMessage } from "@langchain/core/messages";
import {
  DynamicTool,
  Tool,
  DynamicStructuredTool,
  StructuredTool,
  isStructuredTool,
} from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { pinyin } from "pinyin-pro";

const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);

/* ====================== Zod Schemas (must be before any class that uses them) ====================== */

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
] as const;

const computeToolInputSchema = z.object({
  operation: z
    .enum(COMPUTE_OPERATIONS)
    .describe(
      "add|subtract|multiply|divide: two numbers in operands. factorial|square|sqrt: one number. timestamp_to_date: one Unix timestamp (seconds or ms). date_diff_days: two calendar dates as YYYY-MM-DD strings.",
    ),
  operands: z
    .array(z.union([z.number(), z.string()]))
    .min(1)
    .describe(
      "add: [3,5]. subtract|multiply|divide: [a,b]. factorial|square|sqrt: [n]. timestamp_to_date: [unixTs]. date_diff_days: [\"2026-03-08\",\"2026-03-12\"].",
    ),
});

const serverLookupToolInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Server alias name (e.g. 'prod-db', 'web-01') to look up connection details (ip, username, etc)."),
});

const linuxScriptToolInputSchema = z.object({
  serverId: z
    .string()
    .min(1)
    .describe("Preconfigured server identifier (e.g. 'prod-01', 'test-db')"),
  command: z
    .string()
    .min(1)
    .describe("Shell command to execute on the server"),
});

const apiCallerToolInputSchema = z.object({
  url: z.string().url().describe("Full target URL"),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .default("GET")
    .describe("HTTP method"),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional headers (Authorization, Content-Type, etc.)"),
  body: z
    .any()
    .optional()
    .describe("Request body (object, string, or null)"),
});

const sshExecutorToolInputSchema = z.object({
  host: z.string().min(1).describe("SSH host (IP or hostname)"),
  username: z.string().min(1).describe("SSH username"),
  command: z.string().min(1).describe("Shell command to execute"),
  privateKey: z.string().optional().describe("Private key content (PEM format) - mutually exclusive with password"),
  password: z.string().optional().describe("Password for authentication - mutually exclusive with privateKey"),
  confirmed: z
    .boolean()
    .default(false)
    .describe("Set to true to skip confirmation for potentially dangerous commands (rm -rf, reboot, etc.)"),
});

/** Models often send "true"/"false" as strings; coerce so structured tool validation does not loop on schema errors. */
const skillGeneratorAllowOverwriteSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const v = val.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no" || v === "") return false;
  }
  return val;
}, z.boolean().optional().default(false));

/** Skill generator discriminated union - forces model to provide correct fields per targetType */
const skillGeneratorToolInputSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("api"),
    rawDescription: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    method: z.string().optional(),
    endpoint: z.string().optional(),
    interfaceDescription: z.string().optional(),
    parameterContract: z.any().optional(),
    allowOverwrite: skillGeneratorAllowOverwriteSchema,
  }),
  z.object({
    targetType: z.literal("ssh"),
    rawDescription: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    command: z.string().optional(),
    allowOverwrite: skillGeneratorAllowOverwriteSchema,
  }),
  z.object({
    targetType: z.literal("openclaw"),
    rawDescription: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    systemPrompt: z.string().optional(),
    allowOverwrite: skillGeneratorAllowOverwriteSchema,
  }),
  z.object({
    targetType: z.literal("template"),
    rawDescription: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    prompt: z.string().optional(),
    allowOverwrite: skillGeneratorAllowOverwriteSchema,
  }),
]);

import {
  emitToolTraceEvent,
  getActiveParentToolId,
  sanitizeToolTraceArguments,
  sanitizeToolResultForTrace,
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
  prompt?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
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
    required?: string[];
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
  targetType?: "api" | "ssh" | "openclaw" | "template";
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
  // Template specific
  prompt?: string;
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
  let processedName = name;
  if (/[\u4e00-\u9fff]/.test(name)) {
    try {
      processedName = pinyin(name, { toneType: "none", type: "array" }).join(" ");
    } catch {
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

function normalizeExtendedConfig(cfg: ExtendedSkillConfig): ExtendedSkillConfig {
  const next: ExtendedSkillConfig = { ...cfg };
  const rawPc = (cfg as { parameterContract?: unknown }).parameterContract;
  if (typeof rawPc === "string" && rawPc.trim()) {
    try {
      const parsed = JSON.parse(rawPc) as ExtendedSkillConfig["parameterContract"];
      if (parsed && typeof parsed === "object") {
        next.parameterContract = parsed as ExtendedSkillConfig["parameterContract"];
      }
    } catch {
      // keep original
    }
  }
  return next;
}

function parseSkillConfig(skill: GatewaySkill): ExtendedSkillConfig {
  if (!skill.configuration || !skill.configuration.trim()) return {};
  try {
    const parsed = JSON.parse(skill.configuration);
    if (!parsed || typeof parsed !== "object") return {};
    return normalizeExtendedConfig(parsed as ExtendedSkillConfig);
  } catch {
    return {};
  }
}

/**
 * Values that carry no real argument (placeholders). Numbers/booleans are never treated as empty.
 * Objects/arrays are empty only if they have no substantive leaves.
 */
function isEmptyishValue(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((v) => isEmptyishValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return true;
    return keys.every((k) => isEmptyishValue((value as Record<string, unknown>)[k], depth + 1));
  }
  return false;
}

/**
 * True when input is missing, or JSON is {} / only placeholder fields (e.g. {"symbol":""}, {"query":{}}).
 */
function isEmptyApiToolInput(input: string): boolean {
  if (!input?.trim()) return true;
  const payload = parseToolInput(input);
  const keys = Object.keys(payload);
  if (keys.length === 0) return true;
  return keys.every((k) => isEmptyishValue(payload[k]));
}

function hasApiProgressiveDisclosureMaterial(config: ExtendedSkillConfig): boolean {
  const desc = typeof config.interfaceDescription === "string" && config.interfaceDescription.trim().length > 0;
  const pc = config.parameterContract;
  const hasContract = pc != null && typeof pc === "object";
  return desc || hasContract;
}

function appendParameterContractToToolDescription(
  baseDescription: string,
  config: ExtendedSkillConfig,
): string {
  const contract = config.parameterContract as Record<string, unknown> | undefined;
  if (!contract || typeof contract !== "object") {
    return baseDescription;
  }

  const props = contract.type === "object"
    && contract.properties
    && typeof contract.properties === "object"
    && !Array.isArray(contract.properties)
    ? (contract.properties as Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>)
    : null;

  if (props && Object.keys(props).length > 0) {
    const requiredList = Array.isArray(contract.required) ? contract.required as string[] : [];
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
  } catch {
    return baseDescription;
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

/**
 * LLMs often pass API args as a JSON string under `input` (legacy string tool shape).
 * Unwrap so query params match the skill contract (type, key, page, …).
 */
function normalizeApiSkillPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  const rawInput = next.input;
  if (typeof rawInput === "string" && rawInput.trim()) {
    try {
      const inner = JSON.parse(rawInput.trim()) as unknown;
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        delete next.input;
        return { ...(inner as Record<string, unknown>), ...next };
      }
    } catch {
      // not JSON — keep `input` as-is (e.g. free-text)
    }
  }
  return next;
}

function pushScalarDefault(
  out: Record<string, string | number | boolean>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out[key] = value;
  }
}

/**
 * Collect default values from JSON Schema (`type` + `properties`) or gateway flat maps
 * (`{ paramName: { type, default, ... } }`). Merged before the tool payload so callers
 * need not repeat fixed keys (e.g. API key) in every tool call.
 */
function collectParameterDefaults(parameterContract: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!parameterContract || typeof parameterContract !== "object" || Array.isArray(parameterContract)) {
    return out;
  }
  const pc = parameterContract as Record<string, unknown>;

  if (
    pc.type === "object"
    && pc.properties
    && typeof pc.properties === "object"
    && !Array.isArray(pc.properties)
  ) {
    const props = pc.properties as Record<string, { default?: unknown }>;
    for (const [key, spec] of Object.entries(props)) {
      if (!spec || typeof spec !== "object") continue;
      pushScalarDefault(out, key, spec.default);
    }
    return out;
  }

  for (const [key, spec] of Object.entries(pc)) {
    if (key === "required" && Array.isArray(spec)) continue;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) continue;
    pushScalarDefault(out, key, (spec as { default?: unknown }).default);
  }
  return out;
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

  if (input.targetType === "template") {
    return "Generated Template Skill";
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

  if (input.targetType === "template") {
    return `${name}。可复用的提示词模板。`;
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
  } else if (targetType === "template") {
    if (!input.prompt?.trim()) {
      missingFields.push("prompt");
    }
  } else {
    missingFields.push("targetType(api|ssh|openclaw|template)");
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
      ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
      ...(input.query && Object.keys(input.query).length > 0 ? { query: input.query } : {}),
      ...(input.interfaceDescription?.trim() ? { interfaceDescription: input.interfaceDescription.trim() } : {}),
      ...(input.parameterContract ? { parameterContract: input.parameterContract } : {}),
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
      kind: "openclaw",
      systemPrompt: input.systemPrompt?.trim(),
      allowedTools: input.allowedTools || [],
      orchestration: { mode: "serial" },
    };
  } else if (targetType === "template") {
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
  let payload = parseToolInput(input);
  payload = normalizeApiSkillPayload(payload);
  const defaults = collectParameterDefaults(config.parameterContract);
  const merged: Record<string, unknown> = { ...defaults, ...payload };

  // Validate merged payload against parameterContract if defined (JSON Schema shape)
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
      body: merged.body ?? "",
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

/** Agent / OPENCLAW tools: string-input tools or structured tools (e.g. compute). */
type BindableAgentTool = Tool | DynamicTool | StructuredTool;

async function invokeToolDirect(tool: BindableAgentTool, input: unknown): Promise<string> {
  const callableTool = tool as any;
  let rawResult: unknown;
  if (isStructuredTool(tool)) {
    const parsed =
      typeof input === "string"
        ? (JSON.parse((input as string).trim() || "{}") as Record<string, unknown>)
        : input !== undefined && input !== null && typeof input === "object"
          ? (input as Record<string, unknown>)
          : {};
    rawResult = await tool.invoke(parsed);
  } else {
    const serializedInput = typeof input === "string" ? input : JSON.stringify(input ?? {});
    rawResult = callableTool.func
      ? await callableTool.func(serializedInput)
      : await callableTool.invoke(serializedInput);
  }

  if (typeof rawResult === "string") return rawResult;
  if (rawResult && typeof rawResult === "object") {
    const c = (rawResult as Record<string, unknown>).content;
    if (typeof c === "string") return c;
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
  toolLookup: Map<string, BindableAgentTool>,
): BindableAgentTool[] {
  const names = Array.isArray(allowedTools) ? allowedTools : [];
  const resolved = names
    .map((name) => toolLookup.get(name) ?? toolLookup.get(name.trim()) ?? toolLookup.get(name.replace(/-/g, "_")))
    .filter(Boolean) as BindableAgentTool[];

  const deduped = new Map<string, BindableAgentTool>();
  resolved.forEach((tool) => deduped.set(tool.name, tool));
  return Array.from(deduped.values());
}

async function executeOpenClawSkill(
  plannerModel: any,
  parentToolName: string,
  input: string,
  config: ExtendedSkillConfig,
  availableTools: BindableAgentTool[],
): Promise<string> {
  const orchestrationMode = config.orchestration?.mode || "serial";
  if (orchestrationMode !== "serial") {
    return JSON.stringify({ error: `Unsupported OPENCLAW orchestration mode: ${orchestrationMode}` });
  }

  const availableToolLookup = new Map<string, BindableAgentTool>();
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
    "For the compute tool, use structured arguments: operation (enum) and operands (array)—see tool schema. Do not nest under an input key.",
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
          result: sanitizeToolResultForTrace(result),
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
          result: sanitizeToolResultForTrace(message),
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
    /** Base agent tools (including structured tools such as compute). */
    availableTools?: BindableAgentTool[];
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
    const toolLookup = new Map<string, BindableAgentTool>();
    (options?.availableTools || []).forEach((tool) => {
      toolLookup.set(tool.name, tool);
    });

    const resolvedTools: DynamicTool[] = [];
    extensionSkills.forEach((skill) => {
      console.log(`[DEBUG] skill ${skill.id} configuration:`, skill.configuration);
      const config = skill.configuration ? parseSkillConfig(skill) : {} as ExtendedSkillConfig;
      const toolName = normalizeToolName(skill.name || `skill_${skill.id}`, skill.id);
      registerGatewayToolMetadata(toolName, skill);

      let toolDescription = skill.description || `Execute extended skill: ${skill.name}`;
      toolDescription = appendParameterContractToToolDescription(toolDescription, config);

      const dynamicTool = new DynamicTool({
        name: toolName,
        description: toolDescription,
        func: async (input: string) => {
          try {
            // Lazy load full skill details if configuration is missing
            let currentSkill = skill;
            let currentConfig = config;
            if (!currentSkill.configuration) {
              const detailResponse = await axios.get(`${gatewayUrl}/api/skills/${skill.id}`, {
                headers: {
                  "X-Agent-Token": apiToken,
                },
              });
              currentSkill = detailResponse.data as GatewaySkill;
              currentConfig = parseSkillConfig(currentSkill);
            }

            const executionMode = normalizeExecutionMode(currentSkill.executionMode);
            if (isCurrentTimeSkillConfig(currentConfig)) {
              return await executeCurrentTimeSkill(gatewayUrl, apiToken, currentConfig);
            }
            if (isServerMonitorSkillConfig(currentConfig)) {
              return await executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, input, currentConfig);
            }
            if (executionMode === "OPENCLAW" || currentConfig.kind === "openclaw") {
              return await executeOpenClawSkill(
                options?.plannerModel,
                toolName,
                input,
                currentConfig,
                Array.from(toolLookup.values()),
              );
            }
            if ((currentConfig.kind || "").toLowerCase() === "template") {
              const basePrompt = (currentConfig.prompt || "").trim();
              const userPayload = typeof input === "string" ? input.trim() : "";
              // Template skills only embed a system-style prompt in config. The model already passed
              // user content via `input`; if we return prompt alone, static text like "wait for user
              // input" makes the model call this tool again. Merge explicitly and tell the model to answer in chat.
              return JSON.stringify({
                kind: "template",
                prompt: basePrompt,
                userInput: userPayload,
                instruction:
                  "The user's parameters are in userInput. Combine prompt with userInput and write the complete result "
                  + "in your next assistant message as natural language. Do NOT call this tool again for the same request.",
              });
            }
            if ((currentConfig.kind || "").toLowerCase() === "api" || currentConfig.operation === "api-request" || currentConfig.operation === "juhe-joke-list") {
              if (hasApiProgressiveDisclosureMaterial(currentConfig) && isEmptyApiToolInput(input)) {
                // Progressive disclosure: empty / "{}" / whitespace-only object → return docs + contract for a second call.
                return JSON.stringify({
                  status: "REQUIRE_PARAMETERS",
                  message:
                    "This is an API skill. Read the interface description and parameter contract, then call this tool again with the parameters you need to set. "
                    + "Fields that have a default in the contract are filled in automatically if you omit them.",
                  interfaceDescription: currentConfig.interfaceDescription?.trim()
                    || "No separate interface description. Use the parameter contract and tool description above.",
                  parameterContract: currentConfig.parameterContract
                    ?? "No strict contract defined. Please infer from description.",
                });
              }
              return await executeConfiguredApiSkill(gatewayUrl, apiToken, input, currentConfig);
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

export class JavaSkillGeneratorTool extends DynamicStructuredTool<typeof skillGeneratorToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string) {
    super({
      name: "skill_generator",
      description:
        "Creates a NEW extension skill on SkillGateway—use ONLY after you have confirmed no existing tool (built-in, gateway extensions, or loadable filesystem skills) can fulfill the request, OR the user explicitly asked to add/create a new skill. " +
        "Provide targetType and the corresponding fields for that type (api, ssh, openclaw, or template). Do NOT wrap everything in a single JSON string under 'input'.",
      schema: skillGeneratorToolInputSchema,
      func: async (args) => {
        // Cast to the legacy interface for compatibility with existing business logic
        const params = args as SkillGeneratorInput;
        const generated = buildGeneratedSkill(params);

        if (generated.missingFields.length > 0 || !generated.skillPayload || !generated.config) {
          return JSON.stringify({
            status: "INPUT_INCOMPLETE",
            missingFields: generated.missingFields,
            message: "Missing required skill fields. Provide the missing fields and try again.",
          });
        }

        const saveResult = await saveGeneratedSkill(
          gatewayUrl,
          apiToken,
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
            gatewayUrl,
            apiToken,
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
      },
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
export class JavaSshTool extends DynamicStructuredTool<typeof sshExecutorToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string, userId?: string) {
    super({
      name: "ssh_executor",
      description:
        "Executes a shell command on a remote server via SSH. " +
        "Provide host, username, command, and either privateKey or password as separate fields. " +
        "For destructive commands (rm -rf, reboot, etc.), set confirmed: true after user approval.",
      schema: sshExecutorToolInputSchema,
      func: async (args) => {
        try {
          const headers: Record<string, string> = {
            "X-Agent-Token": apiToken,
            "Content-Type": "application/json",
          };
          if (userId) {
            headers["X-User-Id"] = userId;
          }

          // Basic confirmation logic for SSH (preserved from original)
          const dangerousPattern = /rm\s+-rf|mkfs|dd\s+if=|shutdown|reboot/;
          if (!args.confirmed && dangerousPattern.test(args.command)) {
            return JSON.stringify({
              status: "CONFIRMATION_REQUIRED",
              summary: `Execute potentially dangerous SSH command on ${args.host}`,
              details: `Command: ${args.command}`,
              instruction: "This command looks dangerous. Please ask the user to confirm this action. If they agree, call this tool again with 'confirmed': true."
            });
          }

          const response = await axios.post(
            `${gatewayUrl}/api/skills/ssh`,
            args,
            { headers }
          );
          return response.data;
        } catch (error) {
          return `Error executing SSH command: ${formatToolError(error)}`;
        }
      },
    });
  }
}

/**
 * Java 计算工具。
 * <p>
 * 封装对 Java Skill Gateway 计算接口的调用。
 * 使用 {@link DynamicStructuredTool}，使模型侧 function schema 暴露 operation / operands，而非单一 input 字符串。
 * </p>
 */
export class JavaComputeTool extends DynamicStructuredTool<typeof computeToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string) {
    super({
      name: "compute",
      description:
        "Math and date operations via Skill Gateway. Supply operation and operands as separate fields (see parameter schema). "
        + "Gateway body is { operation, operands }—do not wrap them in an extra input string.",
      schema: computeToolInputSchema,
      func: async (args) => {
        try {
          const response = await axios.post(
            `${gatewayUrl}/api/skills/compute`,
            { operation: args.operation, operands: args.operands },
            {
              headers: {
                "X-Agent-Token": apiToken,
                "Content-Type": "application/json",
              },
            },
          );
          return JSON.stringify(response.data);
        } catch (error) {
          return `Error executing compute: ${formatToolError(error)}`;
        }
      },
    });
  }
}

/**
 * Java Linux 脚本执行工具。
 * <p>
 * 使用 DynamicStructuredTool + Zod 提供结构化入参（serverId, command），
 * 避免模型在字符串中嵌套 JSON。
 * </p>
 */
export class JavaLinuxScriptTool extends DynamicStructuredTool<typeof linuxScriptToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string) {
    super({
      name: "linux_script_executor",
      description:
        "Executes a shell command on a preconfigured Linux server. " +
        "Provide serverId and command as separate fields (do NOT wrap in a JSON string under 'input').",
      schema: linuxScriptToolInputSchema,
      func: async (args) => {
        try {
          const response = await axios.post(
            `${gatewayUrl}/api/skills/linux-script`,
            args, // direct object - matches gateway expectation
            {
              headers: {
                "X-Agent-Token": apiToken,
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
      },
    });
  }
}

export class JavaServerLookupTool extends DynamicStructuredTool<typeof serverLookupToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string, userId?: string) {
    super({
      name: "server_lookup",
      description:
        "Looks up server connection details (ip, username, etc) by the server's alias name. " +
        "Provide the 'name' field directly (do NOT wrap in a JSON string under 'input').",
      schema: serverLookupToolInputSchema,
      func: async (args) => {
        try {
          const headers: Record<string, string> = {
            "X-Agent-Token": apiToken,
            "Content-Type": "application/json",
          };
          if (userId) {
            headers["X-User-Id"] = userId;
          }

          const response = await axios.get(
            `${gatewayUrl}/api/skills/server-lookup`,
            {
              headers,
              params: { name: args.name },
            }
          );
          return JSON.stringify(response.data);
        } catch (error) {
          return `Error looking up server: ${formatToolError(error)}`;
        }
      },
    });
  }
}

/**
 * Java API 工具。
 * <p>
 * 使用 DynamicStructuredTool + Zod 提供清晰的 url/method/headers/body 结构，
 * 模型不再需要把所有参数塞进一个字符串。
 * </p>
 */
export class JavaApiTool extends DynamicStructuredTool<typeof apiCallerToolInputSchema> {
  constructor(gatewayUrl: string, apiToken: string) {
    super({
      name: "api_caller",
      description:
        "Calls an external API via the Java gateway. " +
        "Provide url, method, headers, and body as separate fields (do NOT wrap everything in a single JSON string under 'input').",
      schema: apiCallerToolInputSchema,
      func: async (args) => {
        try {
          const response = await axios.post(
            `${gatewayUrl}/api/skills/api`,
            args,
            {
              headers: {
                "X-Agent-Token": apiToken,
                "Content-Type": "application/json",
              },
            }
          );
          return JSON.stringify(response.data);
        } catch (error) {
          return `Error calling API: ${formatToolError(error)}`;
        }
      },
    });
  }
}
