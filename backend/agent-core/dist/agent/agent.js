"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFactory = void 0;
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const openai_1 = require("@langchain/openai");
const java_skills_1 = require("../tools/java-skills");
const tool_prompt_compat_1 = require("../utils/tool-prompt-compat");
const xml_tool_call_compat_1 = require("../utils/xml-tool-call-compat");
class AgentFactory {
    static async createAgent(gatewayUrl, apiToken, openAiApiKey, config, skillManager, userId) {
        const model = new openai_1.ChatOpenAI({
            modelName: config?.modelName || "gpt-4",
            apiKey: openAiApiKey,
            ...(config?.baseUrl
                ? { configuration: { baseURL: config.baseUrl.replace(/\/+$/, "") } }
                : {}),
            temperature: 0,
            callbacks: config?.callbacks,
        });
        const baseTools = [
            new java_skills_1.JavaSshTool(gatewayUrl, apiToken, userId),
            new java_skills_1.JavaApiTool(gatewayUrl, apiToken),
            new java_skills_1.JavaSkillGeneratorTool(gatewayUrl, apiToken),
            new java_skills_1.JavaComputeTool(gatewayUrl, apiToken),
            new java_skills_1.JavaLinuxScriptTool(gatewayUrl, apiToken),
            new java_skills_1.JavaServerLookupTool(gatewayUrl, apiToken, userId),
        ];
        const gatewayExtendedTools = await (0, java_skills_1.loadGatewayExtendedTools)(gatewayUrl, apiToken, userId, {
            plannerModel: model,
            availableTools: baseTools,
            disabledExtendedSkillIds: config?.disabledExtendedSkillIds,
        });
        const tools = [
            ...baseTools,
            ...gatewayExtendedTools,
            ...(skillManager?.getLangChainTools() || []),
        ];
        const toolPromptCompat = (0, tool_prompt_compat_1.isAgentToolPromptCompatEnabled)();
        const agent = (0, prebuilt_1.createReactAgent)({
            llm: model,
            tools: toolPromptCompat ? [] : tools,
            postModelHook: toolPromptCompat ? (0, xml_tool_call_compat_1.createXmlToolCallPostHook)(tools) : undefined,
        });
        return { agent, tools };
    }
}
exports.AgentFactory = AgentFactory;
//# sourceMappingURL=agent.js.map