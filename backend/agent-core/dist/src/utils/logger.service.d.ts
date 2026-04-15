import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
export type LlmLogDirection = 'request' | 'response';
export interface LlmLogEntry {
    id: string;
    sessionId: string;
    invocationId: string;
    direction: LlmLogDirection;
    stage: 'chat_model';
    timestamp: string;
    summary: string;
    modelName?: string;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
}
export interface LlmLogEvent {
    type: 'llm_log';
    entry: LlmLogEntry;
}
type LlmCallbackEmitter = (event: LlmLogEvent) => void;
export declare class LoggerService {
    private readonly logsDir;
    private readonly memoryLogPath;
    private readonly llmLogPath;
    constructor();
    private writeLog;
    private writeJsonLine;
    logMemory(action: 'store' | 'retrieve', data: any): void;
    logLlm(type: 'input' | 'output' | 'agent_thought' | 'tool_result', data: any): void;
    createLlmCallbackHandler(sessionId: string, emit: LlmCallbackEmitter): {
        name: string;
        handleLLMStart?(llm: import("@langchain/core/load/serializable").Serialized, prompts: string[], runId: string, parentRunId?: string | undefined, extraParams?: Record<string, unknown> | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, runName?: string | undefined): any;
        handleLLMNewToken?(token: string, idx: import("@langchain/core/callbacks/base").NewTokenIndices, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, fields?: import("@langchain/core/callbacks/base").HandleLLMNewTokenCallbackFields | undefined): any;
        handleLLMError?(err: any, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, extraParams?: Record<string, unknown> | undefined): any;
        handleLLMEnd?(output: import("@langchain/core/outputs").LLMResult, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, extraParams?: Record<string, unknown> | undefined): any;
        handleChatModelStart?(llm: import("@langchain/core/load/serializable").Serialized, messages: import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[][], runId: string, parentRunId?: string | undefined, extraParams?: Record<string, unknown> | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, runName?: string | undefined): any;
        handleChainStart?(chain: import("@langchain/core/load/serializable").Serialized, inputs: import("@langchain/core/utils/types").ChainValues, runId: string, runType?: string | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, runName?: string | undefined, parentRunId?: string | undefined, extra?: Record<string, unknown> | undefined): any;
        handleChainError?(err: any, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, kwargs?: {
            inputs?: Record<string, unknown> | undefined;
        } | undefined): any;
        handleChainEnd?(outputs: import("@langchain/core/utils/types").ChainValues, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, kwargs?: {
            inputs?: Record<string, unknown> | undefined;
        } | undefined): any;
        handleToolStart?(tool: import("@langchain/core/load/serializable").Serialized, input: string, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, runName?: string | undefined, toolCallId?: string | undefined): any;
        handleToolError?(err: any, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): any;
        handleToolEnd?(output: any, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): any;
        handleToolEvent?(chunk: unknown, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): any;
        handleText?(text: string, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void>;
        handleAgentAction?(action: import("@langchain/core/agents").AgentAction, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void>;
        handleAgentEnd?(action: import("@langchain/core/agents").AgentFinish, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void>;
        handleRetrieverStart?(retriever: import("@langchain/core/load/serializable").Serialized, query: string, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, name?: string | undefined): any;
        handleRetrieverEnd?(documents: import("node_modules/@langchain/core/dist/documents/document.cjs").DocumentInterface<Record<string, any>>[], runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): any;
        handleRetrieverError?(err: any, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): any;
        handleCustomEvent?(eventName: string, data: any, runId: string, tags?: string[] | undefined, metadata?: Record<string, any> | undefined): any;
        lc_serializable: boolean;
        readonly lc_namespace: ["langchain_core", "callbacks", string];
        readonly lc_secrets: {
            [key: string]: string;
        } | undefined;
        readonly lc_attributes: {
            [key: string]: string;
        } | undefined;
        readonly lc_aliases: {
            [key: string]: string;
        } | undefined;
        readonly lc_serializable_keys: string[] | undefined;
        readonly lc_id: string[];
        lc_kwargs: import("node_modules/@langchain/core/dist/load/map_keys.cjs").SerializedFields;
        ignoreLLM: boolean;
        ignoreChain: boolean;
        ignoreAgent: boolean;
        ignoreRetriever: boolean;
        ignoreCustomEvent: boolean;
        raiseError: boolean;
        awaitHandlers: boolean;
        copy(): BaseCallbackHandler;
        toJSON(): import("@langchain/core/load/serializable").Serialized;
        toJSONNotImplemented(): import("@langchain/core/load/serializable").SerializedNotImplemented;
    };
    private appendLlmEntry;
    private stripLangChainExtraParamsNoise;
    private sanitizeInvocationParams;
    private normalizeLangChainRoleToOpenAi;
    private sanitizeMessages;
    private sanitizeLlmOutput;
    private extractModelName;
    private buildRequestSummary;
    private buildResponseSummary;
    private sanitizeValue;
}
export {};
