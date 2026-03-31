import { type BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
export declare function extractXmlToolCallsFromAssistantContent(content: string): {
    toolCalls: Array<{
        name: string;
        args: Record<string, unknown>;
    }>;
    strippedContent: string;
};
export declare function createXmlToolCallPostHook(tools: StructuredToolInterface[]): (state: {
    messages: BaseMessage[];
}, config?: LangGraphRunnableConfig) => Promise<{
    messages: BaseMessage[];
} | Record<string, never>>;
