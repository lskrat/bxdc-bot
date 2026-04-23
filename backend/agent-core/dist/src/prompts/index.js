"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prompts = void 0;
const en_1 = require("./en");
const zh_1 = require("./zh");
function loadPrompts() {
    const lang = (process.env.AGENT_PROMPTS_LANGUAGE || "en").trim().toLowerCase();
    switch (lang) {
        case "zh":
            console.log(`[Prompts] Loaded Chinese system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
            return zh_1.ChinesePrompts;
        case "en":
            console.log(`[Prompts] Loaded English system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
            return en_1.EnglishPrompts;
        default:
            console.warn(`[Prompts] Invalid AGENT_PROMPTS_LANGUAGE value: "${process.env.AGENT_PROMPTS_LANGUAGE}". ` +
                `Falling back to English. Valid values are: "zh" (Chinese), "en" (English).`);
            return en_1.EnglishPrompts;
    }
}
exports.Prompts = loadPrompts();
//# sourceMappingURL=index.js.map