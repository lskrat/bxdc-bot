export declare const PROGRESSIVE_DISCLOSURE_PLACEHOLDER = "[Prior skill turn: parameter contract was requested; full disclosure text omitted.]";
export declare function sanitizeMessageContentForAgent(rawContent: unknown): string;
export type HistoryEntry = {
    role?: string;
    content?: unknown;
    [key: string]: unknown;
};
export declare function sanitizeHistoryForAgent(history: HistoryEntry[]): Array<Record<string, unknown>>;
