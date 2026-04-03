"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const common_1 = require("@nestjs/common");
const tools_1 = require("@langchain/core/tools");
const SKILL_FILE_NAME = 'SKILL.md';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DEFAULT_SKILLS_DIR_NAME = 'SKILLs';
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_METADATA_SUMMARY_LENGTH = 160;
const MAX_METADATA_ENTRIES = 6;
function truncate(value, maxLength) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, maxLength - 1)}…`;
}
function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function extractDescription(content) {
    for (const line of content.split(/\r?\n/)) {
        const normalized = normalizeText(line.replace(/^#+\s*/, ''));
        if (normalized) {
            return normalized;
        }
    }
    return '';
}
function parseFrontmatter(raw) {
    const normalized = raw.replace(/^\uFEFF/, '');
    const match = normalized.match(FRONTMATTER_RE);
    if (!match) {
        return { frontmatter: {}, content: normalized };
    }
    let frontmatter = {};
    try {
        const parsed = js_yaml_1.default.load(match[1]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed;
        }
    }
    catch (error) {
        console.warn('[skills] Failed to parse frontmatter:', error);
    }
    return {
        frontmatter,
        content: normalized.slice(match[0].length),
    };
}
function serializeMetadataValue(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => serializeMetadataValue(entry))
            .filter(Boolean)
            .join(', ');
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .slice(0, 3)
            .map(([key, entry]) => `${key}:${serializeMetadataValue(entry)}`)
            .join(', ');
    }
    return '';
}
function summarizeMetadata(metadata) {
    const summary = Object.entries(metadata)
        .map(([key, value]) => {
        const serialized = normalizeText(serializeMetadataValue(value));
        return serialized ? `${key}=${serialized}` : '';
    })
        .filter(Boolean)
        .slice(0, MAX_METADATA_ENTRIES)
        .join('; ');
    return truncate(summary, MAX_METADATA_SUMMARY_LENGTH);
}
function normalizeToolName(skillId) {
    const normalized = skillId.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return `skill_${normalized || 'loader'}`;
}
function isIgnoredDirectory(dirName) {
    return dirName === '.git' || dirName === 'node_modules' || dirName === 'dist';
}
function isDemoSkill(skill) {
    const category = normalizeText(String(skill.metadata?.category || '')).toLowerCase();
    return category === 'demo' || category === 'example';
}
let SkillManager = class SkillManager {
    getRoutableSkills() {
        return this.listSkills().filter((skill) => !isDemoSkill(skill));
    }
    getConfiguredRoots() {
        const envValue = process.env.AGENT_SKILLS_DIRS || '';
        const envRoots = envValue
            .split(path_1.default.delimiter)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => (path_1.default.isAbsolute(entry) ? entry : path_1.default.resolve(process.cwd(), entry)));
        const defaultRoot = path_1.default.resolve(process.cwd(), DEFAULT_SKILLS_DIR_NAME);
        return Array.from(new Set([defaultRoot, ...envRoots]));
    }
    collectSkillDirs(root) {
        if (!fs_1.default.existsSync(root))
            return [];
        const skillDirs = [];
        const queue = [root];
        const seen = new Set();
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current)
                continue;
            const resolved = path_1.default.resolve(current);
            if (seen.has(resolved))
                continue;
            seen.add(resolved);
            let stat;
            try {
                stat = fs_1.default.statSync(resolved);
            }
            catch {
                continue;
            }
            if (!stat.isDirectory())
                continue;
            if (fs_1.default.existsSync(path_1.default.join(resolved, SKILL_FILE_NAME))) {
                skillDirs.push(resolved);
                continue;
            }
            let entries = [];
            try {
                entries = fs_1.default.readdirSync(resolved);
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                if (isIgnoredDirectory(entry))
                    continue;
                queue.push(path_1.default.join(resolved, entry));
            }
        }
        return skillDirs;
    }
    parseSkillDir(skillDir) {
        const skillPath = path_1.default.join(skillDir, SKILL_FILE_NAME);
        if (!fs_1.default.existsSync(skillPath))
            return null;
        try {
            const raw = fs_1.default.readFileSync(skillPath, 'utf8');
            const { frontmatter, content } = parseFrontmatter(raw);
            const prompt = content.trim();
            const folderId = path_1.default.basename(skillDir);
            const id = normalizeText(String(frontmatter.name || folderId)).replace(/\s+/g, '-').toLowerCase();
            const name = normalizeText(String(frontmatter.name || folderId)) || folderId;
            const description = truncate(normalizeText(String(frontmatter.description || extractDescription(prompt) || name)), MAX_DESCRIPTION_LENGTH);
            const metadata = (frontmatter.metadata && typeof frontmatter.metadata === 'object' && !Array.isArray(frontmatter.metadata)
                ? frontmatter.metadata
                : {});
            return {
                id,
                toolName: normalizeToolName(id),
                name,
                description,
                metadata,
                metadataSummary: summarizeMetadata(metadata),
                skillPath,
                prompt,
            };
        }
        catch (error) {
            console.warn('[skills] Failed to load skill:', skillDir, error);
            return null;
        }
    }
    listSkills() {
        const seen = new Set();
        const skills = [];
        for (const root of this.getConfiguredRoots()) {
            for (const skillDir of this.collectSkillDirs(root)) {
                const skill = this.parseSkillDir(skillDir);
                if (!skill)
                    continue;
                if (seen.has(skill.id))
                    continue;
                seen.add(skill.id);
                skills.push(skill);
            }
        }
        skills.sort((left, right) => left.name.localeCompare(right.name));
        return skills;
    }
    buildSkillPromptContext() {
        const skills = this.getRoutableSkills();
        if (skills.length === 0)
            return '';
        const lines = skills.map((skill) => {
            const metadataSuffix = skill.metadataSummary ? ` | metadata: ${skill.metadataSummary}` : '';
            return `- ${skill.name}: ${skill.description}${metadataSuffix}`;
        });
        return [
            '[Available Skills]',
            'You can load a skill on demand when it is directly relevant.',
            'Only use a skill tool when the current request clearly matches the skill description.',
            'The tool will return the full SKILL.md instructions only after you choose it.',
            ...lines,
            '',
        ].join('\n');
    }
    buildToolResult(skill, reason) {
        const metadataBlock = skill.metadataSummary ? `Metadata: ${skill.metadataSummary}\n` : '';
        const reasonBlock = normalizeText(reason) ? `Why loaded: ${normalizeText(reason)}\n` : '';
        return [
            `Skill loaded: ${skill.name}`,
            `Skill id: ${skill.id}`,
            metadataBlock.trimEnd(),
            reasonBlock.trimEnd(),
            'Follow the instructions below for the current request when relevant:',
            skill.prompt,
        ]
            .filter(Boolean)
            .join('\n\n');
    }
    getLangChainTools() {
        return this.getRoutableSkills().map((skill) => new tools_1.DynamicTool({
            name: skill.toolName,
            description: [
                `Load the full SKILL.md instructions for "${skill.name}".`,
                `Use this only when the user request clearly matches the skill.`,
                `Description: ${skill.description}.`,
                skill.metadataSummary ? `Metadata: ${skill.metadataSummary}.` : '',
                'Input should briefly explain why this skill is needed.',
            ]
                .filter(Boolean)
                .join(' '),
            func: async (input) => this.buildToolResult(skill, input),
        }));
    }
    describeTool(toolName) {
        const skill = this.listSkills().find((entry) => entry.toolName === toolName);
        if (skill) {
            return {
                displayName: skill.name,
                kind: 'skill',
            };
        }
        return {
            displayName: toolName.replace(/^skill_/, '').replace(/_/g, ' '),
            kind: 'tool',
        };
    }
};
exports.SkillManager = SkillManager;
exports.SkillManager = SkillManager = __decorate([
    (0, common_1.Injectable)()
], SkillManager);
//# sourceMappingURL=skill.manager.js.map