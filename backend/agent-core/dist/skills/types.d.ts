export type SkillMetadataValue = string | number | boolean | null | SkillMetadataValue[] | {
    [key: string]: SkillMetadataValue;
};
export type SkillMetadata = Record<string, SkillMetadataValue>;
export interface SkillFrontmatter {
    name?: string;
    description?: string;
    compat_tool_hint?: string;
    metadata?: SkillMetadata;
    [key: string]: unknown;
}
export interface RegisteredSkill {
    id: string;
    toolName: string;
    name: string;
    description: string;
    compatToolHint: string;
    metadata: SkillMetadata;
    metadataSummary: string;
    skillPath: string;
    prompt: string;
}
