import type { StructuredToolInterface } from "@langchain/core/tools";
export declare function isAgentToolPromptCompatEnabled(): boolean;
export declare function formatToolsBlockForSystemPrompt(tools: StructuredToolInterface[], options?: {
    maxSchemaCharsPerTool?: number;
    maxTotalBlockChars?: number;
}): string;
