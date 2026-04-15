export declare function isLlmRawHttpLogEnabled(): boolean;
export declare function isLlmOrgLogRemoteEnabled(): boolean;
export declare function isLlmHttpAuditActive(): boolean;
export type LlmFetchHttpLogContext = {
    userId?: string;
    sessionId?: string;
};
export declare function getLoggingFetchOrUndefined(ctx?: LlmFetchHttpLogContext): typeof fetch | undefined;
