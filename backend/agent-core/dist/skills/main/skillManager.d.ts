import { SqliteStore } from './deps';
export type SkillRecord = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    isOfficial: boolean;
    isBuiltIn: boolean;
    updatedAt: number;
    prompt: string;
    skillPath: string;
    version?: string;
};
type EmailConnectivityCheckCode = 'imap_connection' | 'smtp_connection';
type EmailConnectivityCheckLevel = 'pass' | 'fail';
type EmailConnectivityVerdict = 'pass' | 'fail';
type EmailConnectivityCheck = {
    code: EmailConnectivityCheckCode;
    level: EmailConnectivityCheckLevel;
    message: string;
    durationMs: number;
};
type EmailConnectivityTestResult = {
    testedAt: number;
    verdict: EmailConnectivityVerdict;
    checks: EmailConnectivityCheck[];
};
export declare class SkillManager {
    private getStore;
    private watchers;
    private notifyTimer;
    constructor(getStore: () => SqliteStore);
    getSkillsRoot(): string;
    ensureSkillsRoot(): string;
    syncBundledSkillsToUserData(): void;
    private isSkillRuntimeHealthy;
    private getSkillVersion;
    private mergeSkillsConfig;
    listSkills(): SkillRecord[];
    buildAutoRoutingPrompt(): string | null;
    setSkillEnabled(id: string, enabled: boolean): SkillRecord[];
    deleteSkill(id: string): SkillRecord[];
    downloadSkill(source: string): Promise<{
        success: boolean;
        skills?: SkillRecord[];
        error?: string;
    }>;
    startWatching(): void;
    stopWatching(): void;
    handleWorkingDirectoryChange(): void;
    private scheduleNotify;
    private notifySkillsChanged;
    private parseSkillDir;
    private listBuiltInSkillIds;
    private isBuiltInSkillId;
    private loadSkillStateMap;
    private saveSkillStateMap;
    private loadSkillsDefaults;
    private getSkillRoots;
    private getClaudeSkillsRoot;
    private getBundledSkillsRoot;
    getSkillConfig(skillId: string): {
        success: boolean;
        config?: Record<string, string>;
        error?: string;
    };
    setSkillConfig(skillId: string, config: Record<string, string>): {
        success: boolean;
        error?: string;
    };
    private repairSkillFromBundled;
    private ensureSkillDependencies;
    testEmailConnectivity(skillId: string, config: Record<string, string>): Promise<{
        success: boolean;
        result?: EmailConnectivityTestResult;
        error?: string;
    }>;
    private resolveSkillDir;
    private getScriptRuntimeCandidates;
    private runSkillScriptWithEnv;
    private parseScriptMessage;
    private getLastOutputLine;
    private buildEmailConnectivityCheck;
    private normalizeGitSource;
}
export declare const __skillManagerTestUtils: {
    parseFrontmatter: (raw: string) => {
        frontmatter: Record<string, unknown>;
        content: string;
    };
    isTruthy: (value?: unknown) => boolean;
    extractDescription: (content: string) => string;
};
export {};
