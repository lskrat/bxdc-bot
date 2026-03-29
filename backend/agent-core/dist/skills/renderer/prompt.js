"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInlinedSkillPrompt = exports.getSkillDirectoryFromPath = void 0;
const getSkillDirectoryFromPath = (skillPath) => {
    const normalized = skillPath.trim().replace(/\\/g, '/');
    return normalized.replace(/\/SKILL\.md$/i, '') || normalized;
};
exports.getSkillDirectoryFromPath = getSkillDirectoryFromPath;
const buildInlinedSkillPrompt = (skill) => {
    const skillDirectory = (0, exports.getSkillDirectoryFromPath)(skill.skillPath);
    return [
        `## Skill: ${skill.name}`,
        '<skill_context>',
        `  <location>${skill.skillPath}</location>`,
        `  <directory>${skillDirectory}</directory>`,
        '  <path_rules>',
        '    Resolve relative file references from this skill against <directory>.',
        '    Do not assume skills are under the current workspace directory.',
        '  </path_rules>',
        '</skill_context>',
        '',
        skill.prompt,
    ].join('\n');
};
exports.buildInlinedSkillPrompt = buildInlinedSkillPrompt;
//# sourceMappingURL=prompt.js.map