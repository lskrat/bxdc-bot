import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { JavaSshTool, JavaApiTool, JavaComputeTool, JavaLinuxScriptTool, JavaServerLookupTool } from "../tools/java-skills";
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
  static createAgent(
    gatewayUrl: string,
    apiToken: string,
    openAiApiKey: string,
    config?: { modelName?: string, baseUrl?: string },
    skillManager?: SkillManager,
    userId?: string
  ) {
    const tools = [
      new JavaSshTool(gatewayUrl, apiToken, userId),
      new JavaApiTool(gatewayUrl, apiToken),
      new JavaComputeTool(gatewayUrl, apiToken),
      new JavaLinuxScriptTool(gatewayUrl, apiToken),
      new JavaServerLookupTool(gatewayUrl, apiToken, userId),
      ...(skillManager?.getLangChainTools() || []),
    ];

    const model = new ChatOpenAI({
      modelName: config?.modelName || "gpt-4", // Or use OneAPI compatible model
      openAIApiKey: openAiApiKey,
      configuration: {
        baseURL: config?.baseUrl,
      },
      temperature: 0,
    });

    return createReactAgent({
      llm: model,
      tools: tools,
      // Checkpointer can be added here for persistence
    });
  }
}
