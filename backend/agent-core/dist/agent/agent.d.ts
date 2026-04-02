import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { SkillManager } from "../skills/skill.manager";
import type { StructuredToolInterface } from "@langchain/core/tools";
export type AgentWithTools = {
    agent: ReturnType<typeof createReactAgent>;
    tools: StructuredToolInterface[];
};
export declare class AgentFactory {
    static createAgent(gatewayUrl: string, apiToken: string, openAiApiKey: string, config?: {
        modelName?: string;
        baseUrl?: string;
        callbacks?: any[];
        disabledExtendedSkillIds?: string[];
    }, skillManager?: SkillManager, userId?: string): Promise<AgentWithTools>;
}
