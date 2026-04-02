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
import type { StructuredToolInterface } from "@langchain/core/tools";
import { isAgentToolPromptCompatEnabled } from "../utils/tool-prompt-compat";
import { createXmlToolCallPostHook } from "../utils/xml-tool-call-compat";

export type AgentWithTools = {
  agent: ReturnType<typeof createReactAgent>;
  tools: StructuredToolInterface[];
};

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
    config?: {
      modelName?: string;
      baseUrl?: string;
      callbacks?: any[];
      disabledExtendedSkillIds?: string[];
    },
    skillManager?: SkillManager,
    userId?: string
  ): Promise<AgentWithTools> {
    const model = new ChatOpenAI({
      modelName: config?.modelName || "gpt-4", // Or use OneAPI compatible model
      // Use `apiKey` — @langchain/openai v1 BaseChatOpenAI reads `apiKey`, not `openAIApiKey`, so user-configured keys were previously ignored.
      apiKey: openAiApiKey,
      ...(config?.baseUrl
        ? { configuration: { baseURL: config.baseUrl.replace(/\/+$/, "") } }
        : {}),
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
      disabledExtendedSkillIds: config?.disabledExtendedSkillIds,
    });
    const tools: StructuredToolInterface[] = [
      ...baseTools,
      ...gatewayExtendedTools,
      ...(skillManager?.getLangChainTools() || []),
    ];

    const toolPromptCompat = isAgentToolPromptCompatEnabled();
    const agent = createReactAgent({
      llm: model,
      // 兼容模式：工具说明仅走系统 prompt，不向 API 传 tools，便于对照网关请求体
      tools: toolPromptCompat ? [] : tools,
      // 兼容模式下部分模型把工具调用写在 content 的 XML 里；用 hook 解析并执行，避免空 ToolNode
      postModelHook: toolPromptCompat ? createXmlToolCallPostHook(tools) : undefined,
    });
    return { agent, tools };
  }
}
