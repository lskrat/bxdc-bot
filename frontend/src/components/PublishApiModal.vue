<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useConversations } from '../composables/useConversations'
import { useUser } from '../composables/useUser'
import { copyTextToClipboard } from '../utils/clipboard'
import { apiUrl } from '../services/config'

const props = defineProps<{
  visible: boolean
  conversationId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'published', apiKey: string): void
}>()

const { currentUser } = useUser()
const conversations = useConversations()

const publishType = ref<'internal' | 'external'>('internal')
const apiDescription = ref('')
const externalSystemPrompt = ref('')
const publishing = ref(false)
const publishResult = ref<{ apiKey: string } | null>(null)

const displayUrl = computed(() => {
  if (publishType.value === 'external') {
    return `${window.location.origin}/api/agent-chat/external`
  }
  return `${window.location.origin}/api/agent-chat`
})

// Watch for external type selection → fetch default prompt
watch(publishType, async (newType) => {
  if (newType === 'external' && !externalSystemPrompt.value) {
    try {
      const res = await fetch(apiUrl('/prompts/external-api-default'))
      if (res.ok) {
        const data = await res.json()
        externalSystemPrompt.value = data.prompt || ''
      }
    } catch {
      // 静默失败，管理员可手动填写
    }
  }
})

async function handlePublish() {
  if (!currentUser.value) return

  if (publishType.value !== 'external') {
    if (!apiDescription.value.trim()) {
      MessagePlugin.warning('请填写 API 描述')
      return
    }
  }

  publishing.value = true
  try {
    const result = await conversations.publishConversation(
      props.conversationId,
      currentUser.value.id,
      apiDescription.value.trim(),
      publishType.value,
      externalSystemPrompt.value.trim() || null,
    )
    publishResult.value = result
  } catch (e: any) {
    MessagePlugin.error(e.message || '发布失败')
  } finally {
    publishing.value = false
  }
}

function handleClose() {
  apiDescription.value = ''
  externalSystemPrompt.value = ''
  publishType.value = 'internal'
  publishResult.value = null
  emit('close')
}

function handleDone() {
  const key = publishResult.value?.apiKey
  apiDescription.value = ''
  externalSystemPrompt.value = ''
  publishType.value = 'internal'
  publishResult.value = null
  emit('published', key || '')
}

async function copyApiKey() {
  if (!publishResult.value?.apiKey) return
  const ok = await copyTextToClipboard(publishResult.value.apiKey)
  if (ok) {
    MessagePlugin.success('已复制到剪贴板')
  } else {
    MessagePlugin.error('复制失败，请手动选择文本')
  }
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="发布为 API"
    :width="560"
    :footer="false"
    @close="handleClose"
  >
    <!-- Step 1: Fill description -->
    <template v-if="!publishResult">
      <t-alert theme="info" message="发布后，该对话的页面将变为 API 详情视图，不再显示聊天界面" style="margin-bottom: 16px" />

      <!-- 发布类型选择 -->
      <t-form label-width="80px">
        <t-form-item label="发布类型">
          <t-radio-group v-model="publishType">
            <t-radio value="internal">内部共享（团队内使用）</t-radio>
            <t-radio value="external">外部系统接入（供第三方系统调用）</t-radio>
          </t-radio-group>
        </t-form-item>

        <!-- 外部接入模式：系统提示词 -->
        <template v-if="publishType === 'external'">
          <t-form-item label="系统提示词">
            <t-textarea
              v-model="externalSystemPrompt"
              placeholder="系统提示词已自动填充默认值，可根据需要修改..."
              :maxlength="4000"
              :autosize="{ minRows: 6, maxRows: 12 }"
            />
            <template #help>
              提示词已自动加载默认值，可以根据实际场景修改
            </template>
          </t-form-item>
        </template>

        <!-- 内部共享模式：API 描述 -->
        <template v-else>
          <t-form-item label="API 描述" required>
            <t-textarea
              v-model="apiDescription"
              placeholder="请描述该 API 提供的服务，例如：该 API 提供数据分析和报告生成服务..."
              :maxlength="2000"
              :autosize="{ minRows: 4, maxRows: 8 }"
            />
            <template #help>
              描述将作为 LLM 对话上下文，帮助 AI 理解 API 的服务范围
            </template>
          </t-form-item>
        </template>

        <t-form-item label="调用地址">
          <t-input :value="displayUrl" readonly />
        </t-form-item>
      </t-form>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px">
        <t-button theme="default" @click="handleClose">取消</t-button>
        <t-button theme="primary" :loading="publishing" @click="handlePublish">
          确认发布
        </t-button>
      </div>
    </template>

    <!-- Step 2: Show API Key -->
    <template v-else>
      <t-alert theme="success" message="对话已成功发布为 API" style="margin-bottom: 16px" />
      <t-alert theme="warning" message="请立即保存 API Key，关闭后将无法再次查看完整 Key" style="margin-bottom: 16px" />
      <t-form label-width="80px">
        <t-form-item label="API Key">
          <div style="display: flex; align-items: center; gap: 8px; width: 100%">
            <t-input :value="publishResult.apiKey" readonly style="flex: 1; font-family: monospace" />
            <t-button theme="primary" variant="outline" @click="copyApiKey">复制</t-button>
          </div>
        </t-form-item>
        <t-form-item label="调用方式">
          <pre style="margin: 0; font-size: 12px; background: var(--td-bg-color-component); padding: 8px; border-radius: 4px; width: 100%; overflow-x: auto"><code>curl -X POST {{ displayUrl }} \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "{{ publishResult.apiKey }}", "instruction": "你的问题"}'</code></pre>
        </t-form-item>
      </t-form>
      <div style="display: flex; justify-content: flex-end; margin-top: 16px">
        <t-button theme="primary" @click="handleDone">完成</t-button>
      </div>
    </template>
  </t-dialog>
</template>
