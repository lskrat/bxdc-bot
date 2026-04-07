export declare function normalizeChatMessagesRolesInJsonText(text: string): {
    text: string;
    changed: boolean;
};
export declare function wrapFetchNormalizeLlmMessageRoles(inner: typeof fetch): typeof fetch;
export declare function composeOpenAiCompatibleFetch(): typeof fetch;
