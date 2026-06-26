/**
 * Skill 导出工具（20260625，add-skill-import-export 需求）。
 *
 * 职责：
 * 1. 把 Skill 对象序列化为版本化 JSON（含 metaSchemaVersion / exportedAt / exportedBy 元数据）
 * 2. 在序列化前剥离会话级字段（conversationId / sessionId / userId / xUserId），避免跨会话隔离被破坏
 * 3. 提供 downloadSkillJson() 触发浏览器文件下载
 *
 * 不做敏感字段占位符化——configuration 完整导出，敏感字段由用户自行处理（第一版需求）。
 */
import type { Skill } from '../composables/useSkillHub';

export const SKILL_EXPORT_META_SCHEMA_VERSION = '1.0.0';

/**
 * 用户上下文（导出元数据需要）。
 * SkillHub 的 useUser 返回的 currentUser 形状，按需取字段。
 */
export interface SkillExportUser {
  id: string | number;
  nickname?: string;
}

/**
 * 导出文件的载荷结构。
 */
export interface SkillExportPayload {
  /** 元数据 schema 版本号（当前 1.0.0） */
  metaSchemaVersion: string;
  /** 导出时间戳（ISO 8601） */
  exportedAt: string;
  /** 导出者 user id */
  exportedBy: string;
  /** 导出者昵称（可选） */
  exportedByNickname?: string;
  /** Skill 来源类型（USER / PUBLIC / TEAM；第一版主要是 USER） */
  sourceType: 'USER' | 'PUBLIC' | 'TEAM';
  /** 完整 Skill 实体 */
  skill: Skill;
}

/** 会话级 / 用户级字段：导出时必须剥离（避免跨会话隔离被破坏） */
const SESSION_SCOPED_KEYS = ['conversationId', 'sessionId', 'userId', 'xUserId'] as const;

/**
 * 剥离 configuration JSON 字符串中的会话级字段（递归）。
 * 若 configuration 不是合法 JSON，原样返回字符串（不抛错）。
 */
export function stripSessionScopedFields(configuration: string): string {
  if (!configuration || !configuration.trim()) return configuration;
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    return configuration;
  }
  const cleaned = stripKeysRecursive(parsed);
  try {
    return JSON.stringify(cleaned);
  } catch {
    return configuration;
  }
}

function stripKeysRecursive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripKeysRecursive);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SESSION_SCOPED_KEYS.includes(k as (typeof SESSION_SCOPED_KEYS)[number])) {
        continue;
      }
      result[k] = stripKeysRecursive(v);
    }
    return result;
  }
  return value;
}

/**
 * 把 Skill 序列化为 SkillExportPayload（纯对象，不下载）。
 */
export function exportSkillToJson(skill: Skill, currentUser: SkillExportUser | null | undefined): SkillExportPayload {
  const cleanedSkill: Skill = {
    ...skill,
    configuration: stripSessionScopedFields(skill.configuration ?? ''),
  };
  const sourceType: SkillExportPayload['sourceType'] =
    cleanedSkill.createdBy === 'public' ? 'PUBLIC' : 'USER';

  return {
    metaSchemaVersion: SKILL_EXPORT_META_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser?.id != null ? String(currentUser.id) : 'unknown',
    exportedByNickname: currentUser?.nickname || undefined,
    sourceType,
    skill: cleanedSkill,
  };
}

/**
 * 生成下载文件名：`<skill-name>-<yyyyMMdd-HHmm>.json`。
 * skill-name 中的不安全字符替换为 `_`。
 */
export function buildExportFileName(skillName: string, now: Date = new Date()): string {
  const safeName = (skillName || 'skill').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes());
  return `${safeName}-${ts}.json`;
}

/**
 * 触发浏览器下载 Skill JSON 文件。
 * 实现方式参考 fileService.downloadFile 的 Blob 模式。
 */
export function downloadSkillJson(skill: Skill, currentUser: SkillExportUser | null | undefined): void {
  const payload = exportSkillToJson(skill, currentUser);
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = buildExportFileName(skill.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}