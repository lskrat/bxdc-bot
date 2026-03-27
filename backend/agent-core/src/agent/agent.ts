import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import {
  JavaSshTool,
  JavaApiTool,
  JavaSkillGeneratorTool,
  JavaComputeTool,
  JavaLinuxScriptTool,
  JavaServerLookupTool,
  loadGatewayExtendedTools,
} from "../tools/java-skills";
import type { SkillManager } from "../skills/skill.manager";

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
    config?: { modelName?: string, baseUrl?: string, callbacks?: any[] },
    skillManager?: SkillManager,
    userId?: string
  ) {
    const model = new ChatOpenAI({
      modelName: config?.modelName || "gpt-4", // Or use OneAPI compatible model
      openAIApiKey: openAiApiKey,
      configuration: {
        baseURL: config?.baseUrl,
      },
      temperature: 0,
      callbacks: config?.callbacks,
    });

    const baseTools = [
      new JavaSshTool(gatewayUrl, apiToken, userId),
      new JavaApiTool(gatewayUrl, apiToken),
      new JavaSkillGeneratorTool(gatewayUrl, apiToken),
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
    ];

    return createReactAgent({
      llm: model,
      tools: tools,
      // Checkpointer can be added here for persistence
    });
  }
}
