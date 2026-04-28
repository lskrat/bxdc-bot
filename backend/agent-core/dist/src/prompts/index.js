"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prompts = void 0;
exports.buildStaticSystemPrompt = buildStaticSystemPrompt;
const en_1 = require("./en");
const zh_1 = require("./zh");
let cachedPrompts = null;
let cachedLang = null;
function loadPrompts() {
    const lang = (process.env.AGENT_PROMPTS_LANGUAGE || "en").trim().toLowerCase();
    if (cachedPrompts && cachedLang === lang) {
        return cachedPrompts;
    }
    cachedLang = lang;
    switch (lang) {
        case "zh":
            console.log(`[Prompts] Loaded Chinese system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
            cachedPrompts = zh_1.ChinesePrompts;
            return cachedPrompts;
        case "en":
            console.log(`[Prompts] Loaded English system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
            cachedPrompts = en_1.EnglishPrompts;
            return cachedPrompts;
        default:
            console.warn(`[Prompts] Invalid AGENT_PROMPTS_LANGUAGE value: "${process.env.AGENT_PROMPTS_LANGUAGE}". ` +
                `Falling back to English. Valid values are: "zh" (Chinese), "en" (English).`);
            cachedPrompts = en_1.EnglishPrompts;
            return cachedPrompts;
    }
}
exports.Prompts = new Proxy({}, {
    get(target, prop) {
        const prompts = loadPrompts();
        return prompts[prop];
    },
});
function buildStaticSystemPrompt() {
    return (exports.Prompts.agentRolePrompt
        + exports.Prompts.skillGeneratorPolicy
        + exports.Prompts.extendedSkillRoutingPolicy
        + exports.Prompts.taskTrackingPolicy
        + exports.Prompts.confirmationUIPolicy);
}
//# sourceMappingURL=index.js.map