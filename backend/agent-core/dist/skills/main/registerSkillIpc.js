"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSkillIpcHandlers = registerSkillIpcHandlers;
const electron_1 = require("electron");
function registerSkillIpcHandlers(getSkillManager) {
    electron_1.ipcMain.handle('skills:list', () => {
        try {
            const skills = getSkillManager().listSkills();
            return { success: true, skills };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to load skills' };
        }
    });
    electron_1.ipcMain.handle('skills:setEnabled', (_event, options) => {
        try {
            const skills = getSkillManager().setSkillEnabled(options.id, options.enabled);
            return { success: true, skills };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to update skill' };
        }
    });
    electron_1.ipcMain.handle('skills:delete', (_event, id) => {
        try {
            const skills = getSkillManager().deleteSkill(id);
            return { success: true, skills };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to delete skill' };
        }
    });
    electron_1.ipcMain.handle('skills:download', async (_event, source) => {
        return getSkillManager().downloadSkill(source);
    });
    electron_1.ipcMain.handle('skills:getRoot', () => {
        try {
            const root = getSkillManager().getSkillsRoot();
            return { success: true, path: root };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to resolve skills root' };
        }
    });
    electron_1.ipcMain.handle('skills:autoRoutingPrompt', () => {
        try {
            const prompt = getSkillManager().buildAutoRoutingPrompt();
            return { success: true, prompt };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to build auto-routing prompt' };
        }
    });
    electron_1.ipcMain.handle('skills:getConfig', (_event, skillId) => {
        return getSkillManager().getSkillConfig(skillId);
    });
    electron_1.ipcMain.handle('skills:setConfig', (_event, skillId, config) => {
        return getSkillManager().setSkillConfig(skillId, config);
    });
    electron_1.ipcMain.handle('skills:testEmailConnectivity', async (_event, skillId, config) => {
        return getSkillManager().testEmailConnectivity(skillId, config);
    });
}
//# sourceMappingURL=registerSkillIpc.js.map