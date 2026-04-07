"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFactory = void 0;
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const openai_1 = require("@langchain/openai");
const llm_request_role_normalize_1 = require("../utils/llm-request-role-normalize");
const java_skills_1 = require("../tools/java-skills");
class AgentFactory {
    static async createAgent(gatewayUrl, apiToken, openAiApiKey, config, skillManager, userId) {
        const openAiConfiguration = {};
        if (config?.baseUrl?.trim()) {
            openAiConfiguration.baseURL = config.baseUrl.replace(/\/+$/, "");
        }
        openAiConfiguration.fetch = (0, llm_request_role_normalize_1.composeOpenAiCompatibleFetch)();
        const model = new openai_1.ChatOpenAI({
            modelName: config?.modelName || "gpt-4",
            apiKey: openAiApiKey,
            ...(Object.keys(openAiConfiguration).length > 0
                ? { configuration: openAiConfiguration }
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
        });
        const tools = [
            ...baseTools,
            ...gatewayExtendedTools,
            ...(skillManager?.getLangChainTools() || []),
        ];
        return (0, prebuilt_1.createReactAgent)({
            llm: model,
            tools: tools,
        });
    }
}
exports.AgentFactory = AgentFactory;
//# sourceMappingURL=agent.js.map