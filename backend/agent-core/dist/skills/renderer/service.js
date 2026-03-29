"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillService = void 0;
exports.resolveLocalizedText = resolveLocalizedText;
const marketplace_1 = require("./marketplace");
const i18n_1 = require("./i18n");
function resolveLocalizedText(text) {
    if (!text)
        return '';
    if (typeof text === 'string')
        return text;
    const lang = i18n_1.skillI18n.getLanguage();
    return text[lang] || text.en || '';
}
class SkillService {
    skills = [];
    initialized = false;
    localSkillDescriptions = new Map();
    marketplaceSkillDescriptions = new Map();
    async init() {
        if (this.initialized)
            return;
        await this.loadSkills();
        this.initialized = true;
    }
    async loadSkills() {
        try {
            const result = await window.electron.skills.list();
            if (result.success && result.skills) {
                this.skills = result.skills;
            }
            else {
                this.skills = [];
            }
            return this.skills;
        }
        catch (error) {
            console.error('Failed to load skills:', error);
            this.skills = [];
            return this.skills;
        }
    }
    async setSkillEnabled(id, enabled) {
        try {
            const result = await window.electron.skills.setEnabled({ id, enabled });
            if (result.success && result.skills) {
                this.skills = result.skills;
                return this.skills;
            }
            throw new Error(result.error || 'Failed to update skill');
        }
        catch (error) {
            console.error('Failed to update skill:', error);
            throw error;
        }
    }
    async deleteSkill(id) {
        try {
            const result = await window.electron.skills.delete(id);
            if (result.success && result.skills) {
                this.skills = result.skills;
            }
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete skill';
            console.error('Failed to delete skill:', error);
            return { success: false, error: message };
        }
    }
    async downloadSkill(source) {
        try {
            const result = await window.electron.skills.download(source);
            if (result.success && result.skills) {
                this.skills = result.skills;
            }
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to download skill';
            console.error('Failed to download skill:', error);
            return { success: false, error: message };
        }
    }
    async getSkillsRoot() {
        try {
            const result = await window.electron.skills.getRoot();
            if (result.success && result.path) {
                return result.path;
            }
            return null;
        }
        catch (error) {
            console.error('Failed to get skills root:', error);
            return null;
        }
    }
    onSkillsChanged(callback) {
        return window.electron.skills.onChanged(callback);
    }
    getSkills() {
        return this.skills;
    }
    getEnabledSkills() {
        return this.skills.filter(s => s.enabled);
    }
    getSkillById(id) {
        return this.skills.find(s => s.id === id);
    }
    async getSkillConfig(skillId) {
        try {
            const result = await window.electron.skills.getConfig(skillId);
            if (result.success && result.config) {
                return result.config;
            }
            return {};
        }
        catch (error) {
            console.error('Failed to get skill config:', error);
            return {};
        }
    }
    async setSkillConfig(skillId, config) {
        try {
            const result = await window.electron.skills.setConfig(skillId, config);
            return result.success;
        }
        catch (error) {
            console.error('Failed to set skill config:', error);
            return false;
        }
    }
    async testEmailConnectivity(skillId, config) {
        try {
            const result = await window.electron.skills.testEmailConnectivity(skillId, config);
            if (result.success && result.result) {
                return result.result;
            }
            return null;
        }
        catch (error) {
            console.error('Failed to test email connectivity:', error);
            return null;
        }
    }
    async getAutoRoutingPrompt() {
        try {
            const result = await window.electron.skills.autoRoutingPrompt();
            return result.success ? (result.prompt || null) : null;
        }
        catch (error) {
            console.error('Failed to get auto-routing prompt:', error);
            return null;
        }
    }
    async fetchMarketplaceSkills() {
        try {
            const response = await fetch((0, marketplace_1.getSkillStoreUrl)());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const json = await response.json();
            const value = json?.data?.value;
            const localSkills = Array.isArray(value?.localSkill) ? value.localSkill : [];
            this.localSkillDescriptions.clear();
            for (const localSkill of localSkills) {
                this.localSkillDescriptions.set(localSkill.name, localSkill.description);
            }
            const skills = Array.isArray(value?.marketplace) ? value.marketplace : [];
            const tags = Array.isArray(value?.marketTags) ? value.marketTags : [];
            this.marketplaceSkillDescriptions.clear();
            for (const marketSkill of skills) {
                if (typeof marketSkill.description === 'object') {
                    this.marketplaceSkillDescriptions.set(marketSkill.id, marketSkill.description);
                }
            }
            return { skills, tags };
        }
        catch (error) {
            console.error('Failed to fetch marketplace skills:', error);
            return { skills: [], tags: [] };
        }
    }
    getLocalizedSkillDescription(skillId, skillName, fallback) {
        const localDesc = this.localSkillDescriptions.get(skillName);
        if (localDesc != null)
            return resolveLocalizedText(localDesc);
        const marketDesc = this.marketplaceSkillDescriptions.get(skillId);
        if (marketDesc != null)
            return resolveLocalizedText(marketDesc);
        return fallback;
    }
}
exports.skillService = new SkillService();
//# sourceMappingURL=service.js.map