import { Tool } from "@langchain/core/tools";
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

/**
 * Java SSH 工具。
 * <p>
 * 封装对 Java Skill Gateway SSH 接口的调用。
 * 允许 Agent 在远程服务器上执行 Shell 命令。
 * </p>
 */
export class JavaSshTool extends Tool {
  name = "ssh_executor";
  description = "Executes a shell command on a remote server via SSH. Input should be a JSON string with 'host', 'username', 'privateKey', and 'command'.";

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
