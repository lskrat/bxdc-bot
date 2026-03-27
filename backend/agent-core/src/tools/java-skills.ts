import { DynamicTool, Tool } from "@langchain/core/tools";
import axios from "axios";

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
  configuration?: string;
  enabled?: boolean;
  requiresConfirmation?: boolean;
}

interface SkillMutationPayload {
  name: string;
  description: string;
  type: "EXTENSION";
  configuration: string;
  enabled: boolean;
  requiresConfirmation: boolean;
}

interface ExtendedSkillConfig {
  kind?: string;
  operation?: string;
  method?: string;
  endpoint?: string;
  command?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  apiKey?: string;
  apiKeyField?: string;
  autoTimestampField?: string;
}

interface ApiSkillGeneratorInput {
  rawDescription?: string;
  name?: string;
  description?: string;
  method?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  apiKey?: string;
  apiKeyField?: string;
  autoTimestampField?: string;
  body?: unknown;
  testInput?: Record<string, unknown>;
  enabled?: boolean;
  requiresConfirmation?: boolean;
  allowOverwrite?: boolean;
}

const gatewayExtendedToolRegistry = new Map<string, string>();
const gatewayExtendedToolIdRegistry = new Map<number, string>();

function normalizeToolName(name: string, id: number): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized ? `extended_${normalized}` : `extended_skill_${id}`;
}

export function describeGatewayExtendedTool(toolName: string): { displayName: string; kind: 'skill' | 'tool' } | null {
  const displayName =
    gatewayExtendedToolRegistry.get(toolName)
    ?? gatewayExtendedToolRegistry.get(toolName.replace(/-/g, "_"))
    ?? gatewayExtendedToolRegistry.get(toolName.replace(/_/g, "-"));

  if (displayName) {
    return {
      displayName,
      kind: 'skill',
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
    displayName: idDisplayName,
    kind: 'skill',
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

function deriveSkillName(input: ApiSkillGeneratorInput): string {
  if (typeof input.name === "string" && input.name.trim()) {
    return input.name.trim();
  }

  if (typeof input.endpoint === "string" && input.endpoint.trim()) {
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

  return "Generated API Skill";
}

function deriveSkillDescription(input: ApiSkillGeneratorInput, name: string): string {
  if (typeof input.description === "string" && input.description.trim()) {
    return input.description.trim();
  }

  if (typeof input.rawDescription === "string" && input.rawDescription.trim()) {
    return input.rawDescription.trim();
  }

  const method = typeof input.method === "string" ? input.method.toUpperCase() : "API";
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  return endpoint ? `${name}。通过 ${method} ${endpoint} 发起请求。` : name;
}

function sanitizeConfigForDisplay(config: ExtendedSkillConfig): ExtendedSkillConfig {
  if (!config.apiKey) return config;
  return {
    ...config,
    apiKey: "***",
  };
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

function buildGeneratedApiSkill(input: ApiSkillGeneratorInput): {
  missingFields: string[];
  skillPayload?: SkillMutationPayload;
  config?: ExtendedSkillConfig;
  validationInput?: Record<string, unknown>;
} {
  const missingFields: string[] = [];
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : "";

  if (!endpoint) missingFields.push("endpoint");
  if (!method) missingFields.push("method");
  if (typeof input.apiKeyField === "string" && input.apiKeyField.trim() && !input.apiKey?.trim()) {
    missingFields.push("apiKey");
  }

  if (endpoint) {
    try {
      // Validate early so we can return a clear missing/invalid signal.
      new URL(endpoint);
    } catch {
      missingFields.push("endpoint(valid URL)");
    }
  }

  if (missingFields.length > 0) {
    return { missingFields };
  }

  const name = deriveSkillName(input);
  const description = deriveSkillDescription(input, name);
  const config: ExtendedSkillConfig = {
    kind: "api",
    operation: normalizeGeneratedOperation(name),
    method,
    endpoint,
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
  userId?: string
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

    return extensionSkills.map((skill) => {
      const config = parseSkillConfig(skill);
      const toolName = normalizeToolName(skill.name || `skill_${skill.id}`, skill.id);
      gatewayExtendedToolRegistry.set(toolName, skill.name || `skill_${skill.id}`);
      gatewayExtendedToolRegistry.set(toolName.replace(/_/g, "-"), skill.name || `skill_${skill.id}`);
      gatewayExtendedToolIdRegistry.set(skill.id, skill.name || `skill_${skill.id}`);

      return new DynamicTool({
        name: toolName,
        description: skill.description || `Execute extended skill: ${skill.name}`,
        func: async (input: string) => {
          try {
            if (config.kind === "time" || config.operation === "current-time") {
              return await executeCurrentTimeSkill(gatewayUrl, apiToken, config);
            }
            if (config.operation === "server-resource-status") {
              return await executeServerResourceStatusSkill(gatewayUrl, apiToken, userId, input, config);
            }
            if (config.kind === "api" || config.operation === "api-request" || config.operation === "juhe-joke-list") {
              return await executeConfiguredApiSkill(gatewayUrl, apiToken, input, config);
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
    });
  } catch (error) {
    console.error("[agent-core] Failed to load extended skills from gateway:", formatToolError(error));
    return [];
  }
}

export class JavaApiSkillGeneratorTool extends Tool {
  name = "api_skill_generator";
  description = "Generates an API-based EXTENSION skill from a user's API description, saves it to SkillGateway, and immediately validates it once. Input must be a JSON string with at least 'method' and 'endpoint'. You can also include 'rawDescription', 'name', 'description', 'headers', 'query', 'apiKeyField', 'apiKey', 'autoTimestampField', 'body', 'testInput', and 'allowOverwrite'. If required fields are missing, do not guess; ask the user for them.";

  private gatewayUrl: string;
  private apiToken: string;

  constructor(gatewayUrl: string, apiToken: string) {
    super();
    this.gatewayUrl = gatewayUrl;
    this.apiToken = apiToken;
  }

  async _call(input: string): Promise<string> {
    const params = parseToolInput(input) as ApiSkillGeneratorInput;
    const generated = buildGeneratedApiSkill(params);

    if (generated.missingFields.length > 0 || !generated.skillPayload || !generated.config) {
      return JSON.stringify({
        status: "INPUT_INCOMPLETE",
        missingFields: generated.missingFields,
        message: "Missing required API skill fields. Provide the missing fields and try again.",
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

    const validationRaw = await executeConfiguredApiSkill(
      this.gatewayUrl,
      this.apiToken,
      JSON.stringify(generated.validationInput || {}),
      generated.config
    );
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
  description = "Performs math and date operations. Supports: timestamp to YYYY-MM-DD, add/subtract/multiply/divide, factorial, square, square root. Input: JSON with 'operation' (add|subtract|multiply|divide|factorial|square|sqrt|timestamp_to_date) and 'operands' (array of numbers).";

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
