import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { type BindableAgentTool } from "../tools/java-skills";
import type { SkillManager } from "../skills/skill.manager";
export declare class AgentFactory {
    static createAgent(gatewayUrl: string, apiToken: string, openAiApiKey: string, config?: {
        modelName?: string;
        baseUrl?: string;
        callbacks?: any[];
    }, skillManager?: SkillManager, userId?: string): Promise<{
        agent: ReturnType<typeof createReactAgent>;
        plannerModel: ChatOpenAI;
        baseTools: BindableAgentTool[];
    }>;
}
