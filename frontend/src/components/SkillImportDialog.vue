<script setup lang="ts">
/**
 * Skill 导入对话框（20260625，add-skill-import-export 需求）。
 *
 * 三状态机：
 *   idle       - 待选文件（拖拽 + 选文件按钮）
 *   previewing - 已解析，等待用户点"预览"按钮
 *   preview    - **全可编辑** Skill 表单（与编辑页 SkillManagementModal 结构一致；
 *                用户可改名/改描述/改 configuration/改可见性/改 enabled 等，
 *                改完点确认导入直接入库，不再要求用户手动改 JSON）
 *   conflict   - 命名冲突（三选一：覆盖 / 重命名 / 取消）
 *
 * 流程：
 *   idle → 选文件 → parseSkillJson → previewing
 *   previewing → 点"预览" → preview
 *   preview → 用户改字段（v-model 直接 patch 回 parsed.value） → 点"确认导入"
 *           → createSkill({...改后的字段}) → 成功 toast + emit imported
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

type Phase = 'idle' | 'previewing' | 'preview' | 'conflict';
const phase = ref<Phase>('idle');

const parsed = ref<SkillExportPayload | null>(null);

type ConflictStrategy = 'OVERWRITE' | 'RENAME' | 'CANCEL';
const conflictStrategy = ref<ConflictStrategy>('RENAME');
const renamedName = ref('');
const submitting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// ---------- 编辑：所有字段直接 patch 回 parsed.value ----------

/** 顶层 skill 字段（name/description/visibility/executionMode/enabled/requiresConfirmation 等）的统一 setter。
 * 父组件的 t-input/t-radio-group/t-checkbox v-model 都走这里，确保改动持久化到 parsed.value.skill。 */
function patchSkillField<K extends keyof SkillExportPayload['skill']>(
  field: K,
  value: SkillExportPayload['skill'][K],
): void {
  if (!parsed.value) return;
  parsed.value = {
    ...parsed.value,
    skill: { ...parsed.value.skill, [field]: value },
  };
}

/** description 顶层 patch（textarea 双向绑定） */
const editableDescription = computed<string>({
  get: () => parsed.value?.skill.description ?? '',
  set: (v) => patchSkillField('description', v),
});

/** enabled / requiresConfirmation checkbox v-model */
const editableEnabled = computed<boolean>({
  get: () => parsed.value?.skill.enabled !== false,
  set: (v) => patchSkillField('enabled', v),
});
const editableRequiresConfirmation = computed<boolean>({
  get: () => parsed.value?.skill.requiresConfirmation === true,
  set: (v) => patchSkillField('requiresConfirmation', v),
});

/** visibility / executionMode radio-group v-model */
const editableVisibility = computed<'PRIVATE' | 'PUBLIC'>({
  get: () => (parsed.value?.skill.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE'),
  set: (v) => patchSkillField('visibility', v),
});

/** introMd / templatePlaceholders：父组件双向绑定到 parsed.value.skill */
const editableIntroMd = computed<string>({
  get: () => parsed.value?.skill.introMd ?? '',
  set: (v) => patchSkillField('introMd', v),
});
const editableTemplatePlaceholders = computed<string[]>({
  get: () => parsed.value?.skill.templatePlaceholders ?? [],
  set: (v) => patchSkillField('templatePlaceholders', v),
});

// ---------- configuration 子树编辑（patch 回 parsed.value.skill.configuration 字符串） ----------

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

onMounted(fetchExecutionTypes);

// 当前 Skill 的 executionMode（CONFIG / OPENCLAW）
const currentExecutionMode = computed<string>(() => {
  return parsed.value?.skill.executionMode || 'CONFIG';
});

// 当前 Skill 的 kind（api / ssh / template / python），从 configuration JSON 提取
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

const previewParseError = computed<string | null>(() => {
  if (currentExecutionMode.value !== 'CONFIG') return null;
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

/** 给 ConfigFormRenderer 的对象形式 form values */
const configFormValues = computed<Record<string, unknown>>(() => {
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return {};
  try {
    return JSON.parse(cfg) as Record<string, unknown>;
  } catch {
    return {};
  }
});

/** pretty-print 显示 configuration（parseError 分支用） */
const formattedConfiguration = computed<string>(() => {
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return '';
  try {
    return JSON.stringify(JSON.parse(cfg), null, 2);
  } catch {
    return cfg;
  }
});

/** parseError 分支下，用户可以直接编辑 configuration JSON 文本 */
const editableRawConfiguration = computed<string>({
  get: () => formattedConfiguration.value,
  set: (v) => patchSkillField('configuration', v),
});

/** ConfigFormRenderer 更新时把对象序列化回 configuration 字符串 */
function handleConfigUpdate(values: Record<string, unknown>) {
  if (!parsed.value) return;
  const current = configFormValues.value;
  const merged = { ...current, ...values };
  patchSkillField('configuration', JSON.stringify(merged));
}

// ---------- OPENCLAW 子字段（patch 回 configuration 内的 systemPrompt/orchestration/allowedTools） ----------

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
const editableOpenClawPrompt = computed<string>({
  get: () => openClawPromptText.value,
  set: (v) => {
    const cfg = parsed.value?.skill.configuration;
    if (!cfg) {
      patchSkillField('configuration', JSON.stringify({ systemPrompt: v }));
      return;
    }
    try {
      const obj = JSON.parse(cfg) as Record<string, unknown>;
      obj.systemPrompt = v;
      patchSkillField('configuration', JSON.stringify(obj));
    } catch {
      patchSkillField('configuration', JSON.stringify({ systemPrompt: v }));
    }
  },
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
const editableOpenClawOrchestration = computed<string>({
  get: () => openClawOrchestrationMode.value,
  set: (v) => {
    const cfg = parsed.value?.skill.configuration;
    if (!cfg) {
      patchSkillField('configuration', JSON.stringify({ orchestration: v }));
      return;
    }
    try {
      const obj = JSON.parse(cfg) as Record<string, unknown>;
      obj.orchestration = v;
      patchSkillField('configuration', JSON.stringify(obj));
    } catch {
      patchSkillField('configuration', JSON.stringify({ orchestration: v }));
    }
  },
});

const openClawAllowedTools = computed<string[]>(() => {
  if (currentExecutionMode.value !== 'OPENCLAW') return [];
  const cfg = parsed.value?.skill.configuration;
  if (!cfg) return [];
  try {
    const obj = JSON.parse(cfg) as Record<string, unknown>;
    return Array.isArray(obj.allowedTools)
      ? obj.allowedTools.filter((t): t is string => typeof t === 'string')
      : [];
  } catch {
    return [];
  }
});
const editableOpenClawAllowedTools = computed<string[]>({
  get: () => openClawAllowedTools.value,
  set: (v) => {
    const cfg = parsed.value?.skill.configuration;
    if (!cfg) {
      patchSkillField('configuration', JSON.stringify({ allowedTools: v }));
      return;
    }
    try {
      const obj = JSON.parse(cfg) as Record<string, unknown>;
      obj.allowedTools = v;
      patchSkillField('configuration', JSON.stringify(obj));
    } catch {
      patchSkillField('configuration', JSON.stringify({ allowedTools: v }));
    }
  },
});

function addTool() {
  editableOpenClawAllowedTools.value = [...editableOpenClawAllowedTools.value, ''];
}
function removeTool(index: number) {
  const next = [...editableOpenClawAllowedTools.value];
  next.splice(index, 1);
  editableOpenClawAllowedTools.value = next;
}
function updateTool(index: number, value: string) {
  const next = [...editableOpenClawAllowedTools.value];
  next[index] = value;
  editableOpenClawAllowedTools.value = next;
}

// ---------- 文件选择 / 状态机切换 ----------

function reset() {
  phase.value = 'idle';
  parsed.value = null;
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
    fetchExecutionTypes();
    phase.value = 'previewing';
  } catch (e) {
    phase.value = 'idle';
    parsed.value = null;
    if (e instanceof SkillImportError) {
      MessagePlugin.error(`导入失败：${e.message}`);
    } else {
      MessagePlugin.error('导入失败：未知错误');
    }
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

function goPreview() {
  if (!parsed.value) return;
  const sameName = skills.value.find(s => s.name === parsed.value!.skill.name);
  if (sameName) {
    renamedName.value = `${parsed.value.skill.name}-${formatHms(new Date())}`;
    phase.value = 'conflict';
    return;
  }
  phase.value = 'preview';
}

async function confirmImport() {
  if (!parsed.value) return;
  const name = (parsed.value.skill.name ?? '').trim();
  if (!name) {
    MessagePlugin.warning('请填写 Skill 名称');
    return;
  }
  const sameName = skills.value.find(s => s.name === name);
  if (sameName) {
    renamedName.value = `${name}-${formatHms(new Date())}`;
    phase.value = 'conflict';
    return;
  }
  await doCreate();
}

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
    const dup = skills.value.find(s => s.name === name);
    if (dup) {
      MessagePlugin.error(`名称 "${name}" 已存在，请换一个`);
      return;
    }
    patchSkillField('name', name);
    await doCreate();
    return;
  }
  MessagePlugin.warning('覆盖策略需要先删除旧 Skill，请改用"重命名"');
}

async function doCreate() {
  if (!parsed.value) return;
  submitting.value = true;
  try {
    const input = payloadToCreateInput(parsed.value);
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
    <!-- IDLE -->
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

    <!-- PREVIEWING -->
    <div v-else-if="phase === 'previewing' && parsed" class="previewing-zone">
      <p class="previewing-hint">
        已成功解析导出的 JSON 文件。点击"预览"进入可编辑表单，修改字段后点"确认导入"直接入库。
      </p>
      <div class="previewing-summary">
        <div class="preview-row">
          <span class="preview-label">名称</span>
          <span>{{ parsed.skill.name }}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">类型</span>
          <span>{{ parsed.skill.type }}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">描述</span>
          <span>{{ parsed.skill.description || '（无）' }}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">可见性</span>
          <span>{{ parsed.skill.visibility || 'PRIVATE' }}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">Execution Mode</span>
          <span>{{ currentExecutionMode }}</span>
        </div>
      </div>

      <div class="dialog-footer">
        <t-button variant="outline" @click="reset">取消</t-button>
        <t-button theme="primary" @click="goPreview">
          <template #icon><ViewListIcon /></template>
          预览
        </t-button>
      </div>
    </div>

    <!-- PREVIEW：全可编辑（与编辑页 SkillManagementModal 结构一致） -->
    <div v-else-if="phase === 'preview' && parsed" class="preview-zone">
      <t-form label-align="top" class="preview-form">
        <t-form-item label="名称" name="name">
          <t-input
            :model-value="parsed.skill.name"
            @update:model-value="(v: string) => patchSkillField('name', v)"
            placeholder="Skill 名称"
            :maxlength="100"
          />
        </t-form-item>

        <t-form-item label="技能介绍" name="description">
          <div class="optimize-textarea-wrap">
            <t-textarea
              v-model="editableDescription"
              placeholder="（无描述）"
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
          </div>
        </t-form-item>

        <t-form-item label="可见性" name="visibility">
          <t-radio-group v-model="editableVisibility">
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
          <t-alert theme="warning" :message="`该 Skill 的历史配置当前无法安全映射为结构化表单：${previewParseError}。可手动编辑原始 JSON。`" />
          <t-form-item label="原始 Configuration（可编辑）" name="rawConfiguration">
            <t-textarea
              v-model="editableRawConfiguration"
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
            @update:model-value="handleConfigUpdate"
          />
        </template>

        <template v-else-if="currentExecutionMode === 'OPENCLAW'">
          <t-form-item label="提示词（Markdown）" name="openclawPrompt">
            <div class="optimize-textarea-wrap">
              <t-textarea
                v-model="editableOpenClawPrompt"
                :autosize="{ minRows: 8, maxRows: 16 }"
                placeholder="（无提示词）"
              />
            </div>
          </t-form-item>
          <t-form-item label="编排模式" name="openclawMode">
            <t-select
              v-model="editableOpenClawOrchestration"
              :options="[
                { value: 'serial', label: 'serial（顺序执行）' },
                { value: 'parallel', label: 'parallel（并行执行）' },
              ]"
            />
          </t-form-item>
          <t-form-item label="允许工具列表" name="openclawAllowedTools">
            <div class="tool-list-editor">
              <div
                v-for="(tool, index) in editableOpenClawAllowedTools"
                :key="`tool-${index}`"
                class="tool-row"
              >
                <t-input
                  :model-value="tool"
                  @update:model-value="(v: string) => updateTool(index, v)"
                  placeholder="工具名"
                />
                <t-button variant="text" theme="danger" @click="removeTool(index)">删除</t-button>
              </div>
              <t-button variant="outline" @click="addTool">+ 添加工具</t-button>
              <span v-if="editableOpenClawAllowedTools.length === 0" class="tool-empty">（无）</span>
            </div>
          </t-form-item>
        </template>

        <!-- 模板占位符：仅 TEMPLATE 类型 Skill 有；编辑页无对应展示，导入时可编辑 -->
        <t-form-item
          v-if="Array.isArray(parsed.skill.templatePlaceholders)"
          label="模板占位符"
          name="templatePlaceholders"
        >
          <div class="tool-list-editor">
            <div
              v-for="(ph, index) in editableTemplatePlaceholders"
              :key="`ph-${index}`"
              class="tool-row"
            >
              <t-input
                :model-value="ph"
                @update:model-value="(v: string) => {
                  const next = [...editableTemplatePlaceholders];
                  next[index] = v;
                  editableTemplatePlaceholders = next;
                }"
                placeholder="占位符名"
              />
              <t-button variant="text" theme="danger" @click="editableTemplatePlaceholders = editableTemplatePlaceholders.filter((_, i) => i !== index)">删除</t-button>
            </div>
            <t-button variant="outline" @click="editableTemplatePlaceholders = [...editableTemplatePlaceholders, '']">+ 添加占位符</t-button>
          </div>
        </t-form-item>

        <!-- 介绍（Markdown） -->
        <t-form-item
          label="介绍（Markdown）"
          name="introMd"
        >
          <t-textarea
            v-model="editableIntroMd"
            :autosize="{ minRows: 3, maxRows: 10 }"
            placeholder="（无）"
          />
        </t-form-item>

        <t-space>
          <t-checkbox v-model="editableEnabled">启用</t-checkbox>
          <t-checkbox v-model="editableRequiresConfirmation">需要确认</t-checkbox>
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

    <!-- CONFLICT -->
    <div v-else-if="phase === 'conflict' && parsed" class="conflict-zone">
      <div class="conflict-warn">
        ⚠ 你名下已存在同名 Skill「{{ parsed.skill.name }}」
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
.previewing-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #fafbfc;
  border-radius: 4px;
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preview-form { width: 100%; }
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
.preview-label {
  width: 80px;
  color: #606266;
  font-size: 13px;
  flex-shrink: 0;
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
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
}
.conflict-rename-input {
  margin-top: 8px;
  width: 100%;
}
</style>