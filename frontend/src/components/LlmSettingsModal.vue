<!--
  open spec: convert-llm-settings-to-modal
  大模型连接设置模态弹窗。从 Layout.vue 顶栏按钮触发，关闭后回到聊天上下文，
  表单字段与原 SettingsView 等价（API Base URL / 模型名称 / API Key / 保存 / 清除已存密钥）。
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLlmSettings } from '../composables/useLlmSettings'
import { useUser } from '../composables/useUser'

const { isLlmSettingsVisible, closeLlmSettings } = useLlmSettings()
const { currentUser, fetchLlmSettings, saveLlmSettings } = useUser()

const apiBase = ref('')
const modelName = ref('')
const apiKey = ref('')
const hasStoredKey = ref(false)
const loading = ref(false)
const saving = ref(false)
/** 提示消息；非空时顶部展示 t-alert。success=true 绿，否则红 */
const message = ref('')
const messageSuccess = ref(false)

watch(isLlmSettingsVisible, async (v) => {
  if (!v) {
    // 关闭时仅清提示，保留表单值，下次打开用户看到上次输入
    message.value = ''
    return
  }
  if (!currentUser.value) return
  loading.value = true
  message.value = ''
  try {
    const s = await fetchLlmSettings(currentUser.value.id)
    apiBase.value = s.apiBase || ''
    modelName.value = s.modelName || ''
    hasStoredKey.value = s.hasApiKey
    apiKey.value = ''
  } catch {
    messageSuccess.value = false
    message.value = '加载失败'
  } finally {
    loading.value = false
  }
})

async function handleSave() {
  if (!currentUser.value) return
  saving.value = true
  message.value = ''
  try {
    const payload: { apiBase: string; modelName: string; apiKey?: string } = {
      apiBase: apiBase.value.trim(),
      modelName: modelName.value.trim(),
    }
    if (apiKey.value.trim()) {
      payload.apiKey = apiKey.value.trim()
    }
    await saveLlmSettings(currentUser.value.id, payload)
    hasStoredKey.value = true
    apiKey.value = ''
    messageSuccess.value = true
    message.value = '已保存'
    // 保存成功关闭弹窗
    closeLlmSettings()
  } catch (e: unknown) {
    messageSuccess.value = false
    message.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function clearStoredKey() {
  if (!currentUser.value) return
  saving.value = true
  message.value = ''
  try {
    await saveLlmSettings(currentUser.value.id, {
      apiBase: apiBase.value.trim(),
      modelName: modelName.value.trim(),
      apiKey: '',
    })
    hasStoredKey.value = false
    messageSuccess.value = true
    message.value = '已清除保存的 API Key'
  } catch (e: unknown) {
    messageSuccess.value = false
    message.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <t-dialog
    :visible="isLlmSettingsVisible"
    header="大模型连接"
    width="560px"
    :confirm-btn="{ content: '保存', loading: saving, theme: 'primary' }"
    :cancel-btn="{ content: '取消' }"
    @close="closeLlmSettings"
    @confirm="handleSave"
    @cancel="closeLlmSettings"
  >
    <p v-if="!currentUser" class="muted">请先登录</p>
    <div v-else-if="loading" class="muted">加载中…</div>
    <template v-else>
      <t-alert
        v-if="message"
        :theme="messageSuccess ? 'success' : 'error'"
        :message="message"
        class="alert-row"
        :close-btn="false"
      />
      <p class="description">兼容 OpenAI API 的地址与模型。密钥仅保存在服务端，不会在界面回显。</p>
      <t-form class="settings-form" label-align="top">
        <t-form-item label="API Base URL">
          <t-input v-model="apiBase" placeholder="https://api.openai.com/v1" />
        </t-form-item>
        <t-form-item label="模型名称">
          <t-input v-model="modelName" placeholder="gpt-4o-mini" />
        </t-form-item>
        <t-form-item
          label="API Key"
          help="留空则不修改已保存的密钥"
        >
          <t-input
            v-model="apiKey"
            type="password"
            placeholder="留空则不修改已保存的密钥"
            autocomplete="off"
          />
          <div v-if="hasStoredKey" class="stored-key-row">
            <span class="hint">当前已保存 API Key（仅显示状态，不回显明文）</span>
            <t-link theme="danger" :disabled="saving" @click="clearStoredKey">
              清除已存密钥
            </t-link>
          </div>
        </t-form-item>
      </t-form>
    </template>
  </t-dialog>
</template>

<style scoped>
.description {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--td-text-color-secondary, #666);
}
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.alert-row {
  margin-bottom: 16px;
}
.stored-key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}
.hint {
  font-size: 13px;
  color: var(--td-text-color-secondary, #666);
}
.muted {
  color: var(--td-text-color-secondary, #666);
  margin: 16px 0;
}
</style>