import type { IpcRenderer } from 'electron';
export declare function buildSkillsPreloadBridge(ipcRenderer: IpcRenderer): {
    list: () => any;
    setEnabled: (options: {
        id: string;
        enabled: boolean;
    }) => any;
    delete: (id: string) => any;
    download: (source: string) => any;
    getRoot: () => any;
    autoRoutingPrompt: () => any;
    getConfig: (skillId: string) => any;
    setConfig: (skillId: string, config: Record<string, string>) => any;
    testEmailConnectivity: (skillId: string, config: Record<string, string>) => any;
    onChanged: (callback: () => void) => () => any;
};
