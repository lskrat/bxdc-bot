import { type BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
export type PlainTextToolCall = {
    name: string;
    args: Record<string, unknown>;
};
export declare function extractToolCallsFromJsonValue(parsed: unknown): PlainTextToolCall[];
export declare function extractFencedJsonToolCallsFromAssistantContent(content: string): {
    toolCalls: PlainTextToolCall[];
    strippedContent: string;
};
export declare function extractPlainTextToolCallsFromAssistantContent(content: string): {
    toolCalls: PlainTextToolCall[];
    strippedContent: string;
};
export declare function extractXmlArgumentsPayload(inner: string): string | null;
export declare function extractXmlToolCallsFromAssistantContent(content: string): {
    toolCalls: PlainTextToolCall[];
    strippedContent: string;
};
export declare function createXmlToolCallPostHook(tools: StructuredToolInterface[]): (state: {
    messages: BaseMessage[];
}, config?: LangGraphRunnableConfig) => Promise<{
    messages: BaseMessage[];
} | Record<string, never>>;
