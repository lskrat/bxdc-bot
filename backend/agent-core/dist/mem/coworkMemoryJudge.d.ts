import type { CoworkMemoryGuardLevel } from './coworkMemoryExtractor';
export interface ApiConfig {
    apiKey: string;
    baseURL: string;
    model: string;
}
export declare function resolveCurrentApiConfig(): {
    config: ApiConfig | null;
};
export interface MemoryJudgeInput {
    text: string;
    isExplicit: boolean;
    guardLevel: CoworkMemoryGuardLevel;
    llmEnabled?: boolean;
}
export interface MemoryJudgeResult {
    accepted: boolean;
    score: number;
    reason: string;
    source: 'rule' | 'llm';
}
export declare function judgeMemoryCandidate(input: MemoryJudgeInput): Promise<MemoryJudgeResult>;
