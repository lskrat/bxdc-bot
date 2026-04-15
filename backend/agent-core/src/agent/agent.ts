import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import type { ClientOptions } from "openai";
import { composeOpenAiCompatibleFetch } from "../utils/llm-request-role-normalize";
import {
  JavaSshTool,
  JavaApiTool,
  JavaSkillGeneratorTool,
  JavaComputeTool,
  JavaLinuxScriptTool,
  JavaServerLookupTool,
  loadGatewayExtendedTools,
  type BindableAgentTool,
} from "../tools/java-skills";
import { ManageTasksTool } from "../tools/manage-tasks";
import { AgentAnnotation, preModelHook } from "./tasks-state";
import type { SkillManager } from "../skills/skill.manager";

/** Shared in-process checkpoint store for LangGraph interrupt/resume (see skill-confirmation-react-redesign). */
const sharedAgentCheckpointer = new MemorySaver();

/**
 * Agent 工厂类。
 * <p>
 * 负责创建和配置 LangGraph ReAct Agent 实例。
 * 注入了 Java Skill Gateway 提供的工具和 LLM 模型。
 * </p>
 */
export class AgentFactory {
  /**
   * 创建一个配置好的 ReAct Agent。
   *
   * @param gatewayUrl Java Skill Gateway 的基础 URL
   * @param apiToken 用于认证的 API Token
   * @param openAiApiKey OpenAI API Key
   * @returns 配置好的 Agent 实例
   */
  static async createAgent(
    gatewayUrl: string,
    apiToken: string,
    openAiApiKey: string,
    config?: { modelName?: string, baseUrl?: string, callbacks?: any[], sessionId?: string },
    skillManager?: SkillManager,
    userId?: string
  ): Promise<{
    agent: ReturnType<typeof createReactAgent>;
    plannerModel: ChatOpenAI;
    baseTools: BindableAgentTool[];
  }> {
    const openAiConfiguration: ClientOptions = {};
    if (config?.baseUrl?.trim()) {
      openAiConfiguration.baseURL = config.baseUrl.replace(/\/+$/, "");
    }
    openAiConfiguration.fetch = composeOpenAiCompatibleFetch({
      userId,
      sessionId: config?.sessionId,
    });

    const model = new ChatOpenAI({
      modelName: config?.modelName || "gpt-4", // Or use OneAPI compatible model
      // Use `apiKey` — @langchain/openai v1 BaseChatOpenAI reads `apiKey`, not `openAIApiKey`, so user-configured keys were previously ignored.
      apiKey: openAiApiKey,
      ...(Object.keys(openAiConfiguration).length > 0
        ? { configuration: openAiConfiguration }
        : {}),
      temperature: 0,
      callbacks: config?.callbacks,
    });

    const exposeSshExecutor =
      !userId?.trim()
      || process.env.AGENT_EXPOSE_SSH_EXECUTOR === "1"
      || process.env.AGENT_EXPOSE_SSH_EXECUTOR === "true";
    const baseTools: BindableAgentTool[] = [
      ...(exposeSshExecutor ? [new JavaSshTool(gatewayUrl, apiToken, userId)] : []),
      new JavaApiTool(gatewayUrl, apiToken),
      new JavaSkillGeneratorTool(gatewayUrl, apiToken, userId),
      new JavaComputeTool(gatewayUrl, apiToken),
      new JavaLinuxScriptTool(gatewayUrl, apiToken),
      new JavaServerLookupTool(gatewayUrl, apiToken, userId),
    ];
    const gatewayExtendedTools = await loadGatewayExtendedTools(gatewayUrl, apiToken, userId, {
      plannerModel: model,
      availableTools: baseTools,
    });
    const tools = [
      ...baseTools,
      ...gatewayExtendedTools,
      ...(skillManager?.getLangChainTools() || []),
      new ManageTasksTool(),
    ];

    const agent = createReactAgent({
      llm: model,
      tools,
      stateSchema: AgentAnnotation,
      preModelHook,
      checkpointer: sharedAgentCheckpointer,
    });
    return { agent, plannerModel: model, baseTools };
  }
}
