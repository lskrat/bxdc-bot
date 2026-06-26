/**
 * Skill 导入工具（20260625，add-skill-import-export 需求）。
 *
 * 职责：
 * 1. 解析用户选择的 JSON 文件内容（FileReader → text → JSON.parse）
 * 2. 校验 metaSchemaVersion、skill 必填字段；失败抛 SkillImportError
 * 3. 返回 SkillExportPayload 给 SkillImportDialog 用于预览
 *
 * 不做敏感字段占位符化（第一版需求）。
 */
import type { SkillExportPayload } from './skillExport';
import { SKILL_EXPORT_META_SCHEMA_VERSION } from './skillExport';

/**
 * 导入错误类型。SkillImportDialog 捕获后弹 toast 错误。
 */
export class SkillImportError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SkillImportError';
    this.cause = cause;
  }
}

/**
 * 从 File 对象读取文本（Promise 包装的 FileReader）。
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new SkillImportError('文件读取失败', reader.error));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 解析 JSON 字符串并校验为 SkillExportPayload。
 * 失败抛 SkillImportError（含具体的错误信息）。
 */
export function parseSkillJson(text: string): SkillExportPayload {
  if (!text || !text.trim()) {
    throw new SkillImportError('文件为空');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SkillImportError('文件不是合法 JSON', e);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SkillImportError('文件顶层不是 JSON 对象');
  }
  const obj = raw as Record<string, unknown>;

  // metaSchemaVersion 校验
  if (typeof obj.metaSchemaVersion !== 'string') {
    throw new SkillImportError('缺少 metaSchemaVersion 字段');
  }
  if (obj.metaSchemaVersion !== SKILL_EXPORT_META_SCHEMA_VERSION) {
    throw new SkillImportError(
      `不支持的 schema 版本：${obj.metaSchemaVersion}（当前支持 ${SKILL_EXPORT_META_SCHEMA_VERSION}）`,
    );
  }

  // skill 字段校验
  const skill = obj.skill;
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
    throw new SkillImportError('缺少 skill 字段');
  }
  const skillObj = skill as Record<string, unknown>;
  if (typeof skillObj.name !== 'string' || !skillObj.name.trim()) {
    throw new SkillImportError('skill.name 缺失或为空');
  }
  if (typeof skillObj.type !== 'string' || !skillObj.type.trim()) {
    throw new SkillImportError('skill.type 缺失或为空');
  }

  // exportedBy 推断：缺失则填 unknown（不阻断导入）
  const exportedBy =
    typeof obj.exportedBy === 'string' && obj.exportedBy.trim()
      ? obj.exportedBy
      : 'unknown';
  const exportedByNickname =
    typeof obj.exportedByNickname === 'string' && obj.exportedByNickname.trim()
      ? obj.exportedByNickname
      : undefined;

  // sourceType 推断
  const sourceType: SkillExportPayload['sourceType'] =
    obj.sourceType === 'PUBLIC' || obj.sourceType === 'TEAM' ? obj.sourceType : 'USER';

  return {
    metaSchemaVersion: obj.metaSchemaVersion,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    exportedBy,
    exportedByNickname,
    sourceType,
    skill: skillObj as unknown as SkillExportPayload['skill'],
  };
}

/**
 * 便捷：从 File 直接解析为 SkillExportPayload。
 * 内部串行 readFileAsText + parseSkillJson。
 */
export async function parseSkillFile(file: File): Promise<SkillExportPayload> {
  const text = await readFileAsText(file);
  return parseSkillJson(text);
}

/**
 * 把 SkillExportPayload 转为 createSkill 接口需要的 Omit<Skill, 'id'>。
 * 主要用于 SkillImportDialog 调用 useSkillHub.createSkill。
 *
 * 搬运的字段：name / description / type / configuration / enabled /
 *   requiresConfirmation / visibility / createdBy / avatar / executionMode
 *   + introMd / templatePlaceholders / schemaPropertiesJson
 *   （这三项是 LLM 推理/介绍/模板占位符所需，必须完整搬运）
 *
 * 不搬运：id / createdAt / updatedAt / skillOwnerType / teamId
 *   （这些由后端按当前用户/DB 默认值决定，导入时不保留）
 */
export function payloadToCreateInput(payload: SkillExportPayload): Omit<SkillExportPayload['skill'], 'id'> {
  const skill = payload.skill;
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    configuration: skill.configuration ?? '',
    enabled: skill.enabled ?? true,
    requiresConfirmation: skill.requiresConfirmation,
    visibility: skill.visibility,
    createdBy: skill.createdBy,
    avatar: skill.avatar,
    executionMode: skill.executionMode,
    introMd: skill.introMd,
    templatePlaceholders: skill.templatePlaceholders,
    schemaPropertiesJson: skill.schemaPropertiesJson,
  };
}

// Re-export 方便上层只 import 一次
export type { SkillExportPayload } from './skillExport';
export { SKILL_EXPORT_META_SCHEMA_VERSION } from './skillExport';