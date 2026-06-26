<script setup lang="ts">
/**
 * Skill 导入对话框（20260625，add-skill-import-export 需求）。
 *
 * 三状态机：
 *   idle    - 待选文件（拖拽 + 选文件按钮）
 *   preview - 已解析待确认（展示 Skill 元信息 + 字段计数 + 名称可改名）
 *   conflict - 命名冲突（三选一：覆盖 / 重命名 / 取消）
 *
 * 流程：
 *   idle → 用户选文件 → parseSkillJson → 跳到 preview
 *   preview → 检查当前用户下是否已有同名 → 有冲突跳 conflict，无冲突直接调 createSkill
 *   conflict → 用户选 OVERWRITE/RENAME/CANCEL → 重新调 createSkill 或回 idle
 */
import { ref, computed, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { UploadIcon, ViewListIcon } from 'tdesign-icons-vue-next';
import ConfigFormRenderer, { type ConfigSchema } from './ConfigFormRenderer.vue';
import { useSkillHub, type Skill } from '../composables/useSkillHub';
import { apiUrl } from '../services/config';
import {
  parseSkillFile,
  payloadToCreateInput,
  SkillImportError,
  type SkillExportPayload,
} from '../utils/skillImport';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported', skill: Skill): void;
}>();

const { skills, createSkill } = useSkillHub();

// 状态机
//   idle     - 待选文件
//   previewing - 已选文件，展示元数据等待用户点"确认导入"（仅展示，不可改名）
//   preview  - 改名 + 确认导入
//   conflict - 命名冲突（三选一：覆盖 / 重命名 / 取消）
type Phase = 'idle' | 'previewing' | 'preview' | 'conflict';
const phase = ref<Phase>('idle');

// 当前解析的 payload
const parsed = ref<SkillExportPayload | null>(null);
// 用户在 preview 阶段可能改的 skill 名称
const editableName = ref('');
// 冲突阶段用户选的策略
type ConflictStrategy = 'OVERWRITE' | 'RENAME' | 'CANCEL';
const conflictStrategy = ref<ConflictStrategy>('RENAME');
const renamedName = ref('');
// 是否正在提交
const submitting = ref(false);
// 文件输入 ref（重置 file input 用）
const fileInputRef = ref<HTMLInputElement | null>(null);

// preview 阶段展示的 Skill 只读数据（与 SkillManagementModal 字段一一对应）
// t-form 需要 :data 引用一个 reactive 对象，否则 readonly 字段不会响应
const formView = computed<Record<string, unknown>>(() => ({
  name: parsed.value?.skill.name ?? '',
  description: parsed.value?.skill.description ?? '',
  type: parsed.value?.skill.type ?? '',
  executionMode: parsed.value?.skill.executionMode ?? 'CONFIG',
  visibility: parsed.value?.skill.visibility ?? 'PRIVATE',
  configuration: formattedConfiguration.value,
}));

// configuration 美化（pretty print）。非法 JSON 则原样展示。
// previewParseError 分支（无法映射到结构化表单时）渲染这个。
const formattedConfiguration = computed<string>(() => {
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return '';
  try {
    return JSON.stringify(JSON.parse(cfg), null, 2);
  } catch {
    return cfg;
  }
});

// ---------- preview 阶段：与编辑页 SkillManagementModal 一致的配置渲染 ----------

interface ExecutionType {
  type: string;
  label: string;
  configSchema: ConfigSchema;
}

const executionTypes = ref<ExecutionType[]>([]);

function fetchExecutionTypes() {
  fetch(apiUrl('/api/system-skills/execution-types'))
    .then(res => res.json())
    .then(data => { executionTypes.value = Array.isArray(data) ? data : []; })
    .catch(() => { executionTypes.value = []; });
}

onMounted(() => {
  // 进入对话框即拉一次，preview/previewing 阶段都会用到
  fetchExecutionTypes();
});

// 编辑页在 fetchExecutionTypes 失败时仍允许编辑（schema 退化为 rawConfiguration）。
// preview 同步：拉不到 schema 走 parseError 分支，渲染 rawConfiguration。

// 当前 Skill 的 executionMode（CONFIG / OPENCLAW / undefined）
const currentExecutionMode = computed<string>(() => {
  return parsed.value?.skill.executionMode || 'CONFIG';
});

// 当前 Skill 的 kind（api / ssh / template / python / undefined），从 configuration JSON 提取
const currentConfigKind = computed<string | undefined>(() => {
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return undefined;
  try {
    const obj = JSON.parse(cfg) as Record<string, unknown>;
    return typeof obj.kind === 'string' ? obj.kind : undefined;
  } catch {
    return undefined;
  }
});

const currentExecutionType = computed<ExecutionType | null>(() => {
  if (!currentConfigKind.value) return null;
  return executionTypes.value.find(t => t.type === currentConfigKind.value) ?? null;
});

const currentConfigSchema = computed<ConfigSchema | null>(() => {
  return currentExecutionType.value?.configSchema ?? null;
});

// configuration JSON 是否能映射到结构化 form。任一条件不满足走 parseError 分支。
//   - executionMode 必须是 CONFIG
//   - 找到匹配的 executionType
//   - configuration 是合法 JSON
const previewParseError = computed<string | null>(() => {
  if (currentExecutionMode.value !== 'CONFIG') return null; // OPENCLAW 不走 parseError 分支
  if (!currentConfigKind.value) return 'configuration 缺少 kind 字段';
  if (!currentExecutionType.value) {
    return `未知的配置类型：${currentConfigKind.value}`;
  }
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return 'configuration 为空';
  try {
    JSON.parse(cfg);
  } catch {
    return 'configuration 不是合法 JSON';
  }
  return null;
});

// preview 阶段给 ConfigFormRenderer 的只读 form values。
// 直接用 parsed.skill.configuration 解析后的对象（与 schema property key 一一对应即可）。
const configFormValues = computed<Record<string, unknown>>(() => {
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return {};
  try {
    return JSON.parse(cfg) as Record<string, unknown>;
  } catch {
    return {};
  }
});

// OPENCLAW 模式下的展示数据（从 configuration JSON 提取）
const openClawPromptText = computed<string>(() => {
  if (currentExecutionMode.value !== 'OPENCLAW') return '';
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return '';
  try {
    const obj = JSON.parse(cfg) as Record<string, unknown>;
    return typeof obj.systemPrompt === 'string' ? obj.systemPrompt : '';
  } catch {
    return '';
  }
});

const openClawOrchestrationMode = computed<string>(() => {
  if (currentExecutionMode.value !== 'OPENCLAW') return '';
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return '';
  try {
    const obj = JSON.parse(cfg) as Record<string, unknown>;
    return typeof obj.orchestration === 'string' ? obj.orchestration : 'serial';
  } catch {
    return 'serial';
  }
});

const openClawAllowedTools = computed<string[]>(() => {
  if (currentExecutionMode.value !== 'OPENCLAW') return [];
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return [];
  try {
    const obj = JSON.parse(cfg) as Record<string, unknown>;
    return Array.isArray(obj.allowedTools) ? obj.allowedTools.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
});

function reset() {
  phase.value = 'idle';
  parsed.value = null;
  editableName.value = '';
  conflictStrategy.value = 'RENAME';
  renamedName.value = '';
  submitting.value = false;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function close() {
  reset();
  emit('close');
}

async function handleFile(file: File | null) {
  if (!file) return;
  try {
    const payload = await parseSkillFile(file);
    parsed.value = payload;
    editableName.value = payload.skill.name;
    // 选完文件立刻拉一次 executionTypes（schema 列表），保证 preview 阶段 ConfigFormRenderer 能拿到 schema
    // 而不必等 onMounted 的 fetch 回来（极端情况下用户已选完文件但 fetch 还没完成）
    fetchExecutionTypes();
    // 先进入 previewing 阶段（只展示元数据），用户点"确认导入"再进入 preview 改名阶段
    phase.value = 'previewing';
  } catch (e) {
    phase.value = 'idle';
    parsed.value = null;
    if (e instanceof SkillImportError) {
      MessagePlugin.error(`导入失败：${e.message}`);
    } else {
      MessagePlugin.error('导入失败：未知错误');
    }
    // 重置 file input 允许重新选同一个文件
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function onFileInputChange(ev: Event) {
  const target = ev.target as HTMLInputElement;
  handleFile(target.files?.[0] ?? null);
}

function onDrop(ev: DragEvent) {
  ev.preventDefault();
  const file = ev.dataTransfer?.files?.[0] ?? null;
  handleFile(file);
}

function onDragOver(ev: DragEvent) {
  ev.preventDefault();
}

// 用户从 previewing 阶段点"下一步"（进入可改名 + 确认阶段）
function goPreview() {
  if (!parsed.value) return;
  // 跳转前先检查同名校验（previewing 阶段不阻挡用户，但下一步时若同名会跳 conflict）
  const sameName = skills.value.find((s) => s.name === parsed.value!.skill.name);
  if (sameName) {
    renamedName.value = `${parsed.value.skill.name}-${formatHms(new Date())}`;
    phase.value = 'conflict';
    return;
  }
  phase.value = 'preview';
}

// 用户从 preview 阶段点"确认导入"
async function confirmImport() {
  if (!parsed.value) return;
  const name = editableName.value.trim();
  if (!name) {
    MessagePlugin.warning('请填写 Skill 名称');
    return;
  }
  // preview 阶段再次检查冲突（用户可能改了名）
  const sameName = skills.value.find((s) => s.name === name);
  if (sameName) {
    renamedName.value = `${name}-${formatHms(new Date())}`;
    phase.value = 'conflict';
    return;
  }
  await doCreate(name);
}

// 冲突阶段用户选完策略后点"继续"
async function resolveConflict() {
  if (!parsed.value) return;
  if (conflictStrategy.value === 'CANCEL') {
    reset();
    return;
  }
  if (conflictStrategy.value === 'RENAME') {
    const name = renamedName.value.trim();
    if (!name) {
      MessagePlugin.warning('请填写新名称');
      return;
    }
    const dup = skills.value.find((s) => s.name === name);
    if (dup) {
      MessagePlugin.error(`名称 "${name}" 已存在，请换一个`);
      return;
    }
    await doCreate(name);
    return;
  }
  // OVERWRITE: 第一版未实现删除旧 Skill（需要更复杂的事务），弹提示并降级为 RENAME
  MessagePlugin.warning('覆盖策略需要先删除旧 Skill，请改用"重命名"');
}

async function doCreate(name: string) {
  if (!parsed.value) return;
  submitting.value = true;
  try {
    // 用改后的 name 覆盖 payload.skill.name
    const finalPayload: SkillExportPayload = {
      ...parsed.value,
      skill: { ...parsed.value.skill, name },
    };
    const input = payloadToCreateInput(finalPayload);
    const created = await createSkill(input);
    MessagePlugin.success(`Skill "${created.name}" 导入成功`);
    emit('imported', created);
    close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    MessagePlugin.error(`导入失败：${msg}`);
  } finally {
    submitting.value = false;
  }
}

function formatHms(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
</script>

<template>
  <t-dialog
    :visible="true"
    header="导入 Skill"
    :width="780"
    :footer="false"
    @close="close"
    @update:visible="(v: boolean) => { if (!v) close() }"
  >
    <!-- IDLE：待选文件 -->
    <div v-if="phase === 'idle'" class="idle-zone" @drop="onDrop" @dragover="onDragOver">
      <div class="idle-icon"><UploadIcon size="48" /></div>
      <p class="idle-hint">将 JSON 文件拖拽到此区域，或点击下方按钮选择文件</p>
      <p class="idle-subhint">仅支持本应用导出的 Skill JSON 文件</p>
      <input
        ref="fileInputRef"
        type="file"
        accept="application/json,.json"
        style="display: none"
        @change="onFileInputChange"
      />
      <t-button theme="primary" @click="() => fileInputRef?.click()">
        <template #icon><UploadIcon /></template>
        选择文件
      </t-button>
    </div>

    <!-- PREVIEWING：已解析，等待用户点"预览"按钮 -->
    <div v-else-if="phase === 'previewing' && parsed" class="previewing-zone">
      <p class="previewing-hint">
        已成功解析导出的 JSON 文件，点击"预览"查看 Skill 详细信息。
      </p>

      <div class="dialog-footer">
        <t-button variant="outline" @click="reset">取消</t-button>
        <t-button theme="primary" @click="goPreview">
          <template #icon><ViewListIcon /></template>
          预览
        </t-button>
      </div>
    </div>

    <!-- PREVIEW：展示 Skill 详细信息（结构与编辑页 SkillManagementModal 完全一致） -->
    <div v-else-if="phase === 'preview' && parsed" class="preview-zone">
      <t-form label-align="top" :data="formView" class="preview-form">
        <t-form-item label="名称" name="name">
          <t-input v-model="editableName" placeholder="Skill 名称" :maxlength="100" />
        </t-form-item>

        <t-form-item label="技能介绍" name="description">
          <div class="optimize-textarea-wrap">
            <t-textarea
              :model-value="parsed.skill.description || ''"
              placeholder="（无描述）"
              readonly
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
          </div>
        </t-form-item>

        <t-form-item label="可见性" name="visibility">
          <t-radio-group :model-value="parsed.skill.visibility || 'PRIVATE'" disabled>
            <t-radio-button value="PRIVATE">私人（仅自己可管理）</t-radio-button>
            <t-radio-button value="PUBLIC">公共（全员可见）</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item label="Execution Mode" name="executionMode">
          <t-radio-group :model-value="currentExecutionMode" disabled>
            <t-radio-button value="CONFIG">预配置</t-radio-button>
            <t-radio-button value="OPENCLAW">自主规划</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <template v-if="previewParseError">
          <t-alert theme="warning" :message="`该 Skill 的历史配置当前无法安全映射为结构化表单：${previewParseError}`" />
          <t-form-item label="原始 Configuration（只读）" name="rawConfiguration">
            <t-textarea
              :model-value="formattedConfiguration"
              readonly
              :autosize="{ minRows: 6, maxRows: 12 }"
            />
          </t-form-item>
        </template>

        <template v-else-if="currentExecutionMode === 'CONFIG'">
          <t-form-item label="基础类型" name="configKind">
            <t-select
              :model-value="currentConfigKind"
              :options="executionTypes.map(t => ({ value: t.type, label: t.label }))"
              disabled
            />
          </t-form-item>

          <ConfigFormRenderer
            v-if="currentConfigSchema"
            :config-schema="currentConfigSchema"
            :model-value="configFormValues"
            :readonly="true"
            @update:model-value="() => { /* 只读模式忽略变更 */ }"
          />
        </template>

        <template v-else-if="currentExecutionMode === 'OPENCLAW'">
          <t-form-item label="提示词（Markdown）" name="openclawPrompt">
            <div class="optimize-textarea-wrap">
              <t-textarea
                :model-value="openClawPromptText"
                readonly
                :autosize="{ minRows: 8, maxRows: 16 }"
                placeholder="（无提示词）"
              />
            </div>
          </t-form-item>
          <t-form-item label="编排模式" name="openclawMode">
            <t-input :model-value="openClawOrchestrationMode" readonly />
          </t-form-item>
          <t-form-item label="允许工具列表" name="openclawAllowedTools">
            <div class="tool-list-editor">
              <div
                v-for="(tool, index) in openClawAllowedTools"
                :key="`tool-${index}`"
                class="tool-row"
              >
                <t-input :model-value="tool" readonly />
              </div>
              <span v-if="openClawAllowedTools.length === 0" class="tool-empty">（无）</span>
            </div>
          </t-form-item>
        </template>

        <!-- 模板占位符：仅 TEMPLATE 类型 Skill 有；编辑页无对应展示，导入时搬运 -->
        <t-form-item
          v-if="Array.isArray(parsed.skill.templatePlaceholders) && parsed.skill.templatePlaceholders.length > 0"
          label="模板占位符"
          name="templatePlaceholders"
        >
          <div class="tool-list-editor">
            <div
              v-for="(ph, index) in parsed.skill.templatePlaceholders"
              :key="`ph-${index}`"
              class="tool-row"
            >
              <t-input :model-value="ph" readonly />
            </div>
          </div>
        </t-form-item>

        <!-- 介绍（Markdown）：编辑页通过 /api/skills/updateIntroMd 单独更新，
             导入时搬运展示 -->
        <t-form-item
          v-if="parsed.skill.introMd && parsed.skill.introMd.trim()"
          label="介绍（Markdown）"
          name="introMd"
        >
          <t-textarea
            :model-value="parsed.skill.introMd"
            readonly
            :autosize="{ minRows: 3, maxRows: 10 }"
          />
        </t-form-item>

        <t-space>
          <t-checkbox :checked="parsed.skill.enabled !== false" disabled>启用</t-checkbox>
          <t-checkbox :checked="parsed.skill.requiresConfirmation === true" disabled>需要确认</t-checkbox>
        </t-space>
      </t-form>

      <div class="preview-export-info">
        <span class="preview-label">导出信息</span>
        <span class="preview-meta">
          {{ parsed.exportedByNickname || parsed.exportedBy }} · {{ parsed.exportedAt }}
        </span>
      </div>

      <div class="sensitive-warning">
        ⚠ 敏感信息（如 SSH 密码 / API Key）请确认是否在共享前已手动删除
      </div>

      <div class="dialog-footer">
        <t-button variant="outline" @click="phase = 'previewing'">上一步</t-button>
        <t-button variant="outline" @click="reset">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="confirmImport">确认导入</t-button>
      </div>
    </div>

    <!-- CONFLICT：命名冲突 -->
    <div v-else-if="phase === 'conflict' && parsed" class="conflict-zone">
      <div class="conflict-warn">
        ⚠ 你名下已存在同名 Skill「{{ editableName }}」
      </div>
      <t-radio-group v-model="conflictStrategy">
        <t-radio value="RENAME">
          重命名（建议）：使用新名称
          <t-input
            v-if="conflictStrategy === 'RENAME'"
            v-model="renamedName"
            placeholder="新名称"
            :maxlength="100"
            class="conflict-rename-input"
          />
        </t-radio>
        <t-radio value="OVERWRITE" disabled>
          覆盖（暂未启用，需要先删除旧 Skill）
        </t-radio>
        <t-radio value="CANCEL">取消导入</t-radio>
      </t-radio-group>

      <div class="dialog-footer">
        <t-button variant="outline" @click="reset">返回</t-button>
        <t-button theme="primary" :loading="submitting" @click="resolveConflict">继续</t-button>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>
.idle-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  text-align: center;
  gap: 12px;
}
.idle-icon { color: #909399; }
.idle-hint { margin: 0; font-size: 14px; color: #303133; }
.idle-subhint { margin: 0; font-size: 12px; color: #909399; }

.preview-zone, .conflict-zone {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.previewing-zone {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.previewing-hint {
  margin: 0;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  color: #303133;
  text-align: center;
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preview-row-block { align-items: flex-start; }
.preview-form {
  width: 100%;
}
.preview-form :deep(.optimize-textarea-wrap) {
  position: relative;
  width: 100%;
}
.preview-form :deep(.tool-list-editor) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.preview-form :deep(.tool-row) {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-empty {
  color: #909399;
  font-size: 13px;
}
.preview-export-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 0 0;
  border-top: 1px dashed #ebeef5;
  font-size: 12px;
  color: #909399;
}
.preview-label {
  width: 80px;
  color: #606266;
  font-size: 13px;
  flex-shrink: 0;
}
.preview-meta {
  font-size: 12px;
  color: #909399;
}
.sensitive-warning {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  font-size: 12px;
  color: #d46b08;
}
.conflict-warn {
  padding: 8px 12px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 13px;
}
.conflict-rename-input {
  margin-top: 8px;
  width: 100%;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
</style>