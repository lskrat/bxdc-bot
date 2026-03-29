export declare class SkillServiceManager {
    private webSearchPid;
    private skillEnv;
    private hasWebSearchRuntimeScriptSupport;
    private hasLegacyWebSearchEncodingHeuristic;
    private isWebSearchDistOutdated;
    private isWebSearchRuntimeHealthy;
    private hasCommand;
    private repairWebSearchRuntimeFromBundled;
    private resolveNodeRuntime;
    private ensureWebSearchRuntimeReady;
    startAll(): Promise<void>;
    stopAll(): Promise<void>;
    startWebSearchService(): Promise<void>;
    private startWebSearchServiceProcess;
    stopWebSearchService(): Promise<void>;
    isWebSearchServiceRunning(): boolean;
    private getWebSearchPath;
    getStatus(): {
        webSearch: boolean;
    };
    checkWebSearchHealth(): Promise<boolean>;
}
export declare function getSkillServiceManager(): SkillServiceManager;
