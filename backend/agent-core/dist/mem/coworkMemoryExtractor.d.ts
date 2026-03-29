export type CoworkMemoryGuardLevel = 'strict' | 'standard' | 'relaxed';
export interface ExtractedMemoryChange {
    action: 'add' | 'delete';
    text: string;
    confidence: number;
    isExplicit: boolean;
    reason: string;
}
export interface ExtractTurnMemoryOptions {
    userText: string;
    assistantText: string;
    guardLevel: CoworkMemoryGuardLevel;
    maxImplicitAdds?: number;
}
export declare function isQuestionLikeMemoryText(text: string): boolean;
export declare function extractTurnMemoryChanges(options: ExtractTurnMemoryOptions): ExtractedMemoryChange[];
