<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { BUILT_IN_SKILLS, type Skill, useSkillHub, getExecutionModeLabel, getConfigSummary } from '../composables/useSkillHub';
import {
  createDefaultSkillDraft,
  getConfigKindOptions,
  isApiDraft,
  isSshDraft,
  isOpenClawDraft,
  getPresetLabel,
  parseSkillDraft,
  serializeSkillDraft,
  type ConfigKind,
  type ExecutionMode,
  type SkillConfigDraft,
} from '../utils/skillEditor';

const {
  isSkillManagementVisible,
  skills,
  isLoading,
  error,
  closeSkillManagement,
  createSkill,
  updateSkill,
  deleteSkill,
  toggleSkillEnabled,
} = useSkillHub();

const isFormVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<number | null>(null);
const parseError = ref<string | null>(null);
const rawConfiguration = ref('{}');
const configDraft = ref<SkillConfigDraft>(createDefaultSkillDraft('CONFIG'));

const formData = reactive({
  name: '',
  description: '',
  executionMode: 'CONFIG' as ExecutionMode,
  enabled: true,
  requiresConfirmation: false,
});

const configKindOptions = getConfigKindOptions();

const currentConfigKind = computed<ConfigKind>(() => {
  if (isApiDraft(configDraft.value)) return 'api';
  return 'ssh';
});

const apiDraft = computed(() => (isApiDraft(configDraft.value) ? configDraft.value : null));
const sshDraft = computed(() => (isSshDraft(configDraft.value) ? configDraft.value : null));
const openClawDraft = computed(() => (isOpenClawDraft(configDraft.value) ? configDraft.value : null));

const suggestedTools = computed(() => {
  const names = new Set<string>(['compute']);
  skills.value.forEach((skill) => {
    if (skill.name) {
      names.add(skill.name);
    }
  });
  BUILT_IN_SKILLS.forEach((skill) => {
    if (skill.name.includes('Compute')) {
      names.add('compute');
    }
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-CN'));
});

function resetForm() {
  formData.name = '';
  formData.description = '';
  formData.executionMode = 'CONFIG';
  formData.enabled = true;
  formData.requiresConfirmation = false;
  currentId.value = null;
  parseError.value = null;
  rawConfiguration.value = '{}';
  configDraft.value = createDefaultSkillDraft('CONFIG');
}

function openCreateForm() {
  isEditMode.value = false;
  resetForm();
  isFormVisible.value = true;
}

function openEditForm(skill: Skill) {
  isEditMode.value = true;
  currentId.value = skill.id;
  formData.name = skill.name;
  formData.description = skill.description || '';
  formData.executionMode = skill.executionMode ?? 'CONFIG';
  formData.enabled = skill.enabled;
  formData.requiresConfirmation = skill.requiresConfirmation ?? false;
  rawConfiguration.value = skill.configuration || '{}';
  const parsed = parseSkillDraft(formData.executionMode, rawConfiguration.value);
  parseError.value = parsed.error;
  configDraft.value = parsed.draft ?? createDefaultSkillDraft(formData.executionMode);
  isFormVisible.value = true;
}

function handleExecutionModeChange(value: string) {
  formData.executionMode = value === 'OPENCLAW' ? 'OPENCLAW' : 'CONFIG';
  configDraft.value = createDefaultSkillDraft(formData.executionMode);
  parseError.value = null;
  rawConfiguration.value = '{}';
}

function handleConfigKindChange(value: string) {
  const kind = configKindOptions.some((option) => option.value === value) ? (value as ConfigKind) : 'api';
  configDraft.value = createDefaultSkillDraft('CONFIG', kind);
  parseError.value = null;
}

function handleApiPresetChange(value: string) {
  if (!apiDraft.value) return;
  apiDraft.value.preset = value === 'current-time' ? 'current-time' : 'none';
  if (apiDraft.value.preset === 'current-time') {
    if (!apiDraft.value.operation.trim()) apiDraft.value.operation = 'current-time';
    if (!apiDraft.value.method.trim()) apiDraft.value.method = 'GET';
    if (!apiDraft.value.endpoint.trim()) apiDraft.value.endpoint = 'https://vv.video.qq.com/checktime?otype=json';
  }
}

function addAllowedTool() {
  if (!openClawDraft.value) return;
  openClawDraft.value.allowedTools.push('');
}

function removeAllowedTool(index: number) {
  if (!openClawDraft.value) return;
  openClawDraft.value.allowedTools.splice(index, 1);
}

function useSuggestedTool(toolName: string) {
  if (!openClawDraft.value) return;
  if (openClawDraft.value.allowedTools.includes(toolName)) {
    return;
  }
  const emptyIndex = openClawDraft.value.allowedTools.findIndex((tool) => !tool.trim());
  if (emptyIndex >= 0) {
    openClawDraft.value.allowedTools[emptyIndex] = toolName;
    return;
  }
  openClawDraft.value.allowedTools.push(toolName);
}

async function handleSubmit() {
  if (parseError.value) {
    MessagePlugin.error('当前 Skill 配置无法安全解析，请先处理配置兼容问题');
    return;
  }

  try {
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      type: 'EXTENSION',
      executionMode: formData.executionMode,
      configuration: serializeSkillDraft(formData.executionMode, configDraft.value),
      enabled: formData.enabled,
      requiresConfirmation: formData.requiresConfirmation,
    };

    if (isEditMode.value && currentId.value != null) {
      await updateSkill(currentId.value, payload);
      MessagePlugin.success('Skill 更新成功');
    } else {
      await createSkill(payload);
      MessagePlugin.success('Skill 创建成功');
    }
    isFormVisible.value = false;
    resetForm();
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '操作失败');
  }
}

async function handleDelete(id: number) {
  try {
    await deleteSkill(id);
    MessagePlugin.success('Skill 删除成功');
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '删除失败');
  }
}

async function handleEnabledChange(skill: Skill, value: boolean) {
  try {
    await toggleSkillEnabled(skill, value);
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '状态更新失败');
  }
}
</script>

<template>
  <t-dialog
    v-model:visible="isSkillManagementVisible"
    header="Extended Skill 管理"
    width="760px"
    :confirm-btn="null"
    :cancel-btn="null"
    @close="closeSkillManagement"
  >
    <div class="skill-management-content">
      <div class="actions">
        <t-button theme="primary" @click="openCreateForm">
          <template #icon><AddIcon /></template>
          新增 Skill
        </t-button>
      </div>

      <div v-if="isLoading" class="loading-state">
        <t-loading text="Loading skills..." />
      </div>
      <div v-else-if="error" class="error-state">
        <t-alert theme="error" :message="error" />
      </div>
      <div v-else-if="skills.length === 0" class="empty-state">
        <p>暂无 Extended Skill</p>
      </div>

      <t-table
        v-else
        :data="skills"
        row-key="id"
        :columns="[
          { colKey: 'name', title: 'Name' },
          { colKey: 'description', title: 'Description' },
          { colKey: 'executionMode', title: '类型', width: 120 },
          { colKey: 'enabled', title: 'Enabled' },
          { colKey: 'operations', title: '操作', width: 160 }
        ]"
        size="small"
      >
        <template #executionMode="{ row }">
          <t-space>
            <t-tag :theme="row.executionMode === 'OPENCLAW' ? 'warning' : 'primary'" variant="light" size="small">
              {{ getExecutionModeLabel(row.executionMode) }}
            </t-tag>
            <t-tag v-if="row.executionMode === 'CONFIG' && getConfigSummary(row.configuration).kindLabel" variant="light" size="small">
              {{ getConfigSummary(row.configuration).kindLabel }}
            </t-tag>
          </t-space>
        </template>
        <template #enabled="{ row }">
          <t-switch
            :model-value="row.enabled"
            @update:model-value="(value: boolean) => handleEnabledChange(row, value)"
          />
        </template>
        <template #operations="{ row }">
          <t-space>
            <t-button variant="text" shape="square" @click="openEditForm(row)">
              <EditIcon />
            </t-button>
            <t-popconfirm content="确认删除该 Skill 吗？" @confirm="handleDelete(row.id)">
              <t-button variant="text" theme="danger" shape="square">
                <DeleteIcon />
              </t-button>
            </t-popconfirm>
          </t-space>
        </template>
      </t-table>
    </div>
  </t-dialog>

  <t-dialog
    v-model:visible="isFormVisible"
    :header="isEditMode ? '编辑 Skill' : '新增 Skill'"
    width="860px"
    @confirm="handleSubmit"
  >
    <t-form :data="formData" label-align="top">
      <t-form-item label="Name" name="name">
        <t-input v-model="formData.name" placeholder="例如：获取时间" />
      </t-form-item>
      <t-form-item label="Description" name="description">
        <t-textarea v-model="formData.description" :autosize="{ minRows: 2, maxRows: 4 }" />
      </t-form-item>
      <t-form-item label="Execution Mode" name="executionMode">
        <t-radio-group :model-value="formData.executionMode" @update:model-value="handleExecutionModeChange">
          <t-radio-button value="CONFIG">预配置</t-radio-button>
          <t-radio-button value="OPENCLAW">自主规划</t-radio-button>
        </t-radio-group>
      </t-form-item>

      <template v-if="parseError">
        <t-alert theme="warning" :message="`该 Skill 的历史配置当前无法安全映射为结构化表单：${parseError}`" />
        <t-form-item label="原始 Configuration（只读）" name="rawConfiguration">
          <t-textarea
            :model-value="rawConfiguration"
            readonly
            :autosize="{ minRows: 6, maxRows: 12 }"
          />
        </t-form-item>
      </template>

      <template v-else-if="formData.executionMode === 'CONFIG'">
        <t-form-item label="基础类型" name="configKind">
          <t-select
            :model-value="currentConfigKind"
            :options="configKindOptions"
            @change="handleConfigKindChange"
          />
        </t-form-item>

        <template v-if="apiDraft">
          <t-form-item label="预配置模板" name="apiPreset">
            <t-select
              :model-value="apiDraft.preset"
              :options="[
                { value: 'none', label: getPresetLabel('api', 'none') },
                { value: 'current-time', label: getPresetLabel('api', 'current-time') }
              ]"
              @change="handleApiPresetChange"
            />
          </t-form-item>
          <t-form-item label="操作标识" name="apiOperation">
            <t-input v-model="apiDraft.operation" :placeholder="apiDraft.preset === 'current-time' ? '例如：current-time' : '例如：juhe-joke-list'" />
          </t-form-item>
          <t-form-item label="请求方法" name="apiMethod">
            <t-input v-model="apiDraft.method" placeholder="例如：GET / POST" />
          </t-form-item>
          <t-form-item label="请求地址" name="apiEndpoint">
            <t-input v-model="apiDraft.endpoint" :placeholder="apiDraft.preset === 'current-time' ? '例如：https://vv.video.qq.com/checktime?otype=json' : '例如：http://v.juhe.cn/joke/content/list'" />
          </t-form-item>
          <t-form-item label="响应包装字段" name="apiResponseWrapper">
            <t-input v-model="apiDraft.responseWrapper" placeholder="例如：QZOutputJson" />
          </t-form-item>
          <t-form-item label="时间戳字段" name="apiResponseTimestampField">
            <t-input v-model="apiDraft.responseTimestampField" placeholder="例如：t" />
          </t-form-item>
          <t-form-item label="Headers (JSON，可选)" name="apiHeaders">
            <t-textarea v-model="apiDraft.headersText" :autosize="{ minRows: 3, maxRows: 6 }" placeholder='例如：{"Authorization":"Bearer token"}' />
          </t-form-item>
          <t-form-item label="Query (JSON，可选)" name="apiQuery">
            <t-textarea v-model="apiDraft.queryText" :autosize="{ minRows: 3, maxRows: 6 }" placeholder='例如：{"page":1,"pagesize":1}' />
          </t-form-item>
          <t-form-item label="Body (JSON，可选)" name="apiBody">
            <t-textarea v-model="apiDraft.bodyText" :autosize="{ minRows: 3, maxRows: 6 }" placeholder='例如：{"foo":"bar"}' />
          </t-form-item>
          <t-form-item label="API Key 字段名" name="apiKeyField">
            <t-input v-model="apiDraft.apiKeyField" placeholder="例如：key" />
          </t-form-item>
          <t-form-item label="API Key" name="apiKey">
            <t-input v-model="apiDraft.apiKey" placeholder="例如：your-api-key" />
          </t-form-item>
          <t-form-item label="自动时间戳字段" name="autoTimestampField">
            <t-input v-model="apiDraft.autoTimestampField" placeholder="例如：time" />
          </t-form-item>
        </template>

        <template v-else-if="sshDraft">
          <t-form-item label="预配置模板" name="sshPreset">
            <t-input :model-value="getPresetLabel('ssh', sshDraft.preset)" readonly />
          </t-form-item>
          <t-form-item label="操作标识" name="sshOperation">
            <t-input v-model="sshDraft.operation" placeholder="例如：server-resource-status" />
          </t-form-item>
          <t-form-item label="服务器查找器" name="sshLookup">
            <t-input v-model="sshDraft.lookup" placeholder="例如：server_lookup" />
          </t-form-item>
          <t-form-item label="执行器" name="sshExecutor">
            <t-input v-model="sshDraft.executor" placeholder="例如：ssh_executor" />
          </t-form-item>
          <t-form-item label="执行命令" name="sshCommand">
            <t-textarea v-model="sshDraft.command" :autosize="{ minRows: 5, maxRows: 10 }" />
          </t-form-item>
          <t-form-item label="只读模式" name="sshReadOnly">
            <t-checkbox v-model="sshDraft.readOnly">该 SSH 预配置 Skill 只允许只读命令</t-checkbox>
          </t-form-item>
        </template>
      </template>

      <template v-else-if="openClawDraft">
        <t-form-item label="提示词（Markdown）" name="openclawPrompt">
          <t-textarea
            v-model="openClawDraft.systemPromptMarkdown"
            :autosize="{ minRows: 8, maxRows: 16 }"
            placeholder="直接输入 Markdown 格式提示词，保存时会写入 systemPrompt。"
          />
        </t-form-item>
        <t-form-item label="编排模式" name="openclawMode">
          <t-input :model-value="openClawDraft.orchestrationMode" readonly />
        </t-form-item>
        <t-form-item label="允许工具列表" name="openclawAllowedTools">
          <div class="tool-list-editor">
            <div
              v-for="(_, index) in openClawDraft.allowedTools"
              :key="`tool-${index}`"
              class="tool-row"
            >
              <t-input v-model="openClawDraft.allowedTools[index]" placeholder="例如：compute" />
              <t-button variant="outline" theme="danger" @click="removeAllowedTool(index)">删除</t-button>
            </div>
            <t-button variant="dashed" @click="addAllowedTool">
              <template #icon><AddIcon /></template>
              添加工具
            </t-button>
            <div class="tool-suggestions">
              <span class="tool-suggestions-label">常用工具：</span>
              <t-space>
                <t-button
                  v-for="toolName in suggestedTools"
                  :key="toolName"
                  size="small"
                  variant="outline"
                  @click="useSuggestedTool(toolName)"
                >
                  {{ toolName }}
                </t-button>
              </t-space>
            </div>
          </div>
        </t-form-item>
      </template>

      <t-space>
        <t-checkbox v-model="formData.enabled">启用</t-checkbox>
        <t-checkbox v-model="formData.requiresConfirmation">需要确认</t-checkbox>
      </t-space>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.skill-management-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-list-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tool-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-suggestions-label {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.loading-state,
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--td-text-color-secondary);
}
</style>
