"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSkillsPreloadBridge = buildSkillsPreloadBridge;
function buildSkillsPreloadBridge(ipcRenderer) {
    return {
        list: () => ipcRenderer.invoke('skills:list'),
        setEnabled: (options) => ipcRenderer.invoke('skills:setEnabled', options),
        delete: (id) => ipcRenderer.invoke('skills:delete', id),
        download: (source) => ipcRenderer.invoke('skills:download', source),
        getRoot: () => ipcRenderer.invoke('skills:getRoot'),
        autoRoutingPrompt: () => ipcRenderer.invoke('skills:autoRoutingPrompt'),
        getConfig: (skillId) => ipcRenderer.invoke('skills:getConfig', skillId),
        setConfig: (skillId, config) => ipcRenderer.invoke('skills:setConfig', skillId, config),
        testEmailConnectivity: (skillId, config) => ipcRenderer.invoke('skills:testEmailConnectivity', skillId, config),
        onChanged: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('skills:changed', handler);
            return () => ipcRenderer.removeListener('skills:changed', handler);
        },
    };
}
//# sourceMappingURL=preload.js.map