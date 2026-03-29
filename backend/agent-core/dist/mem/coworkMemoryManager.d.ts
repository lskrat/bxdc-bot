import { type CoworkMemoryGuardLevel } from './coworkMemoryExtractor';
export interface Database {
    exec(sql: string, params?: (string | number | null)[]): any[];
    run(sql: string, params?: (string | number | null)[]): void;
    getRowsModified?(): number;
    export(): Uint8Array;
}
export type CoworkUserMemoryStatus = 'created' | 'stale' | 'deleted';
export interface CoworkUserMemory {
    id: string;
    text: string;
    confidence: number;
    isExplicit: boolean;
    status: CoworkUserMemoryStatus;
    createdAt: number;
    updatedAt: number;
    lastUsedAt: number | null;
    userId: string | null;
}
export interface CoworkUserMemoryRow {
    id: string;
    text: string;
    fingerprint: string;
    confidence: number;
    is_explicit: number;
    status: string;
    created_at: number;
    updated_at: number;
    last_used_at: number | null;
    user_id: string | null;
}
export interface CoworkUserMemorySourceInput {
    sessionId?: string;
    messageId?: string;
    role?: 'user' | 'assistant' | 'tool' | 'system';
}
export interface CoworkUserMemoryStats {
    total: number;
    created: number;
    stale: number;
    deleted: number;
    explicit: number;
    implicit: number;
}
export interface ApplyTurnMemoryUpdatesOptions {
    sessionId: string;
    userId?: string;
    userText: string;
    assistantText: string;
    implicitEnabled: boolean;
    memoryLlmJudgeEnabled: boolean;
    guardLevel: CoworkMemoryGuardLevel;
    userMessageId?: string;
    assistantMessageId?: string;
}
export interface ApplyTurnMemoryUpdatesResult {
    totalChanges: number;
    created: number;
    updated: number;
    deleted: number;
    judgeRejected: number;
    llmReviewed: number;
    skipped: number;
}
export declare class MemoryManager {
    private db;
    private saveDb;
    constructor(db: Database, saveDb: () => void);
    private getOne;
    private getAll;
    private mapMemoryRow;
    private addMemorySource;
    private createOrReviveUserMemory;
    listUserMemories(options?: {
        query?: string;
        userId?: string;
        status?: CoworkUserMemoryStatus | 'all';
        limit?: number;
        offset?: number;
        includeDeleted?: boolean;
    }): CoworkUserMemory[];
    createUserMemory(input: {
        text: string;
        confidence?: number;
        isExplicit?: boolean;
        source?: CoworkUserMemorySourceInput;
        userId?: string;
    }): CoworkUserMemory;
    updateUserMemory(input: {
        id: string;
        text?: string;
        confidence?: number;
        status?: CoworkUserMemoryStatus;
        isExplicit?: boolean;
    }): CoworkUserMemory | null;
    deleteUserMemory(id: string): boolean;
    getUserMemoryStats(): CoworkUserMemoryStats;
    autoDeleteNonPersonalMemories(): number;
    markMemorySourcesInactiveBySession(sessionId: string): void;
    markOrphanImplicitMemoriesStale(): void;
    applyTurnMemoryUpdates(options: ApplyTurnMemoryUpdatesOptions): Promise<ApplyTurnMemoryUpdatesResult>;
}
