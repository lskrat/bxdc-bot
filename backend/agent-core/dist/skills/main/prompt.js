"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripAutoRoutingPromptForFollowUp = stripAutoRoutingPromptForFollowUp;
const AVAILABLE_SKILLS_SECTION_RE = /## Skills \(mandatory\)[\s\S]*?<\/available_skills>/;
function stripAutoRoutingPromptForFollowUp(systemPrompt) {
    if (!systemPrompt || !systemPrompt.includes('<available_skills>')) {
        return systemPrompt ?? undefined;
    }
    return systemPrompt.replace(AVAILABLE_SKILLS_SECTION_RE, '## Skills\nSkill already loaded for this session. Continue following its instructions.');
}
//# sourceMappingURL=prompt.js.map