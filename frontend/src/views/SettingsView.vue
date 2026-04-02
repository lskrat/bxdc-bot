<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUser } from '../composables/useUser';
import { useRouter } from 'vue-router';
import Card from '../components/ui/Card.vue';
import Button from '../components/ui/Button.vue';
import Input from '../components/ui/Input.vue';

const {
  currentUser,
  fetchLlmSettings,
  saveLlmSettings,
  fetchSkillAvailability,
  saveSkillAvailability,
} = useUser();
const router = useRouter();

const apiBase = ref('');
const modelName = ref('');
const apiKey = ref('');
const hasStoredKey = ref(false);
const loading = ref(false);
const saving = ref(false);
const message = ref('');

const skillLoading = ref(false);
const skillSaving = ref(false);
const skillMessage = ref('');
const skillRows = ref<{ id: number; name: string; description: string }[]>([]);
const disabledSkillIds = ref<string[]>([]);

onMounted(async () => {
  if (!currentUser.value) {
    router.replace('/login');
    return;
  }
  loading.value = true;
  try {
    const s = await fetchLlmSettings(currentUser.value.id);
    apiBase.value = s.apiBase || '';
    modelName.value = s.modelName || '';
    hasStoredKey.value = s.hasApiKey;
    apiKey.value = '';
    message.value = '';
  } catch (e) {
    message.value = '加载失败';
  } finally {
    loading.value = false;
  }

  skillLoading.value = true;
  skillMessage.value = '';
  try {
    const sa = await fetchSkillAvailability(currentUser.value.id);
    skillRows.value = sa.skills || [];
    disabledSkillIds.value = [...(sa.disabledSkillIds || [])];
  } catch {
    skillMessage.value = '扩展 Skill 列表加载失败';
    skillRows.value = [];
    disabledSkillIds.value = [];
  } finally {
    skillLoading.value = false;
  }
});

function isSkillEnabled(id: number): boolean {
  return !disabledSkillIds.value.includes(String(id));
}

async function onSkillToggle(id: number, enabled: boolean) {
  if (!currentUser.value) return;
  const sid = String(id);
  if (enabled) {
    disabledSkillIds.value = disabledSkillIds.value.filter((x) => x !== sid);
  } else if (!disabledSkillIds.value.includes(sid)) {
    disabledSkillIds.value = [...disabledSkillIds.value, sid];
  }
  skillSaving.value = true;
  skillMessage.value = '';
  try {
    const sa = await saveSkillAvailability(currentUser.value.id, disabledSkillIds.value);
    disabledSkillIds.value = [...(sa.disabledSkillIds || [])];
    skillMessage.value = '已保存';
  } catch (e: any) {
    skillMessage.value = e?.message || '保存失败';
  } finally {
    skillSaving.value = false;
  }
}

async function handleSave() {
  if (!currentUser.value) return;
  saving.value = true;
  message.value = '';
  try {
    const payload: { apiBase: string; modelName: string; apiKey?: string } = {
      apiBase: apiBase.value.trim(),
      modelName: modelName.value.trim(),
    };
    if (apiKey.value.trim()) {
      payload.apiKey = apiKey.value.trim();
    }
    await saveLlmSettings(currentUser.value.id, payload);
    hasStoredKey.value = true;
    apiKey.value = '';
    message.value = '已保存';
  } catch (e: any) {
    message.value = e?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

async function clearStoredKey() {
  if (!currentUser.value) return;
  saving.value = true;
  try {
    await saveLlmSettings(currentUser.value.id, {
      apiBase: apiBase.value.trim(),
      modelName: modelName.value.trim(),
      apiKey: '',
    });
    hasStoredKey.value = false;
    message.value = '已清除保存的 API Key';
  } catch (e: any) {
    message.value = e?.message || '操作失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <Card class="settings-card" title="大模型连接" description="兼容 OpenAI API 的地址与模型。密钥仅保存在服务端，不会在界面回显。">
      <div v-if="loading" class="muted">加载中…</div>
      <form v-else class="settings-form" @submit.prevent="handleSave">
        <Input v-model="apiBase" label="API Base URL" placeholder="https://api.openai.com/v1" />
        <Input v-model="modelName" label="模型名称" placeholder="gpt-4o-mini" />
        <Input v-model="apiKey" label="API Key" type="password" placeholder="留空则不修改已保存的密钥" autocomplete="off" />
        <p v-if="hasStoredKey" class="hint">当前已保存 API Key（仅显示状态，不回显明文）</p>
        <div v-if="message" class="msg">{{ message }}</div>
        <div class="actions">
          <Button type="submit" variant="primary" :loading="saving">保存</Button>
          <Button v-if="hasStoredKey" type="button" variant="secondary" :loading="saving" @click="clearStoredKey">
            清除已存密钥
          </Button>
          <Button type="button" variant="ghost" @click="router.push('/')">返回聊天</Button>
        </div>
      </form>
    </Card>

    <Card
      class="settings-card skill-avail-card"
      title="扩展 Skill 可用性"
      description="仅作用于数据库中的 EXTENSION 类 Skill；关闭后对应工具不会出现在 Agent 与兼容模式系统提示中。磁盘 SKILL.md 不受影响。"
    >
      <div v-if="skillLoading" class="muted">加载中…</div>
      <div v-else-if="!skillRows.length" class="muted">当前没有可配置的扩展 Skill</div>
      <ul v-else class="skill-avail-list">
        <li v-for="row in skillRows" :key="row.id" class="skill-avail-row">
          <div class="skill-avail-meta">
            <div class="skill-avail-name">{{ row.name }}</div>
            <div v-if="row.description" class="skill-avail-desc">{{ row.description }}</div>
          </div>
          <t-switch
            :model-value="isSkillEnabled(row.id)"
            :loading="skillSaving"
            @update:model-value="(v: boolean) => onSkillToggle(row.id, v)"
          />
        </li>
      </ul>
      <p v-if="skillMessage" class="msg skill-msg">{{ skillMessage }}</p>
    </Card>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 520px;
  margin: 0 auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.skill-avail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skill-avail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--td-component-border, rgba(0, 0, 0, 0.06));
}
.skill-avail-row:last-child {
  border-bottom: none;
}
.skill-avail-meta {
  flex: 1;
  min-width: 0;
}
.skill-avail-name {
  font-weight: 500;
  font-size: 14px;
}
.skill-avail-desc {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
.skill-msg {
  margin-top: 12px;
  margin-bottom: 0;
}
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hint {
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin: 0;
}
.msg {
  font-size: 14px;
  color: var(--td-success-color);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.muted {
  color: var(--td-text-color-secondary);
}
</style>
