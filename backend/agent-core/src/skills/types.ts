export type SkillMetadataValue =
  | string
  | number
  | boolean
  | null
  | SkillMetadataValue[]
  | { [key: string]: SkillMetadataValue };

export type SkillMetadata = Record<string, SkillMetadataValue>;

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  /** 兼容模式首轮调用要点（渐进披露）；非 string 类型忽略 */
  compat_tool_hint?: string;
  metadata?: SkillMetadata;
  [key: string]: unknown;
}

export interface RegisteredSkill {
  id: string;
  toolName: string;
  name: string;
  description: string;
  /** 已规范化截断；无 frontmatter 字段时为 "" */
  compatToolHint: string;
  metadata: SkillMetadata;
  metadataSummary: string;
  skillPath: string;
  prompt: string;
}
