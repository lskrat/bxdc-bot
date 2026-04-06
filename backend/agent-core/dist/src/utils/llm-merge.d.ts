export type LlmOverrides = {
    llmApiBase?: string;
    llmModelName?: string;
    llmApiKey?: string;
};
export declare function pickMergedLlm(overrides: LlmOverrides | undefined | null): {
    apiKey: string | undefined;
    modelName: string;
    baseUrl: string | undefined;
};
