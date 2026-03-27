<script setup lang="ts">
import { reactive, ref } from 'vue';
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { type Skill, useSkillHub } from '../composables/useSkillHub';

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

const formData = reactive({
  name: '',
  description: '',
  configuration: '{}',
  enabled: true,
  requiresConfirmation: false,
});

function resetForm() {
  formData.name = '';
  formData.description = '';
  formData.configuration = '{}';
  formData.enabled = true;
  formData.requiresConfirmation = false;
  currentId.value = null;
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
  formData.configuration = skill.configuration || '{}';
  formData.enabled = skill.enabled;
  formData.requiresConfirmation = skill.requiresConfirmation ?? false;
  isFormVisible.value = true;
}

function validateConfigurationJson(config: string) {
  try {
    JSON.parse(config);
    return true;
  } catch {
    return false;
  }
}

async function handleSubmit() {
  if (!validateConfigurationJson(formData.configuration)) {
    MessagePlugin.error('Configuration 必须是合法 JSON');
    return;
  }

  const payload = {
    name: formData.name.trim(),
    description: formData.description.trim(),
    type: 'EXTENSION',
    configuration: formData.configuration.trim(),
    enabled: formData.enabled,
    requiresConfirmation: formData.requiresConfirmation,
  };

  try {
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
          { colKey: 'enabled', title: 'Enabled' },
          { colKey: 'operations', title: '操作', width: 160 }
        ]"
        size="small"
      >
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
    @confirm="handleSubmit"
  >
    <t-form :data="formData" label-align="top">
      <t-form-item label="Name" name="name">
        <t-input v-model="formData.name" placeholder="例如：获取时间" />
      </t-form-item>
      <t-form-item label="Description" name="description">
        <t-textarea v-model="formData.description" :autosize="{ minRows: 2, maxRows: 4 }" />
      </t-form-item>
      <t-form-item label="Configuration (JSON)" name="configuration">
        <t-textarea
          v-model="formData.configuration"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder='例如：{"kind":"time","operation":"current-time"}'
        />
      </t-form-item>
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

.loading-state,
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--td-text-color-secondary);
}
</style>
