<script setup lang="ts">
import { ref } from 'vue'
import { ChatSender as TChatSender } from '@tdesign-vue-next/chat'
import { useChat } from '../composables/useChat'
import { useUser } from '../composables/useUser'

const { sendMessage, isThinking } = useChat()
const { currentUser } = useUser()
const input = ref('')

async function handleSend(value: string) {
  // @ts-ignore
  const text = (typeof value === 'string' ? value : value?.text || '').trim()
  if (!text || isThinking.value) return
  input.value = ''
  // Pass current user ID if logged in
  await sendMessage(text, currentUser.value?.id)
}
</script>

<template>
  <div class="input-container">
    <TChatSender
      v-model="input"
      class="chat-sender"
      :loading="isThinking"
      placeholder="输入消息，Enter 发送，Shift + Enter 换行"
      :textarea-props="{ autosize: { minRows: 1, maxRows: 6 } }"
      @send="handleSend"
    />
    <p class="input-disclaimer">AI 生成内容可能有误，请注意甄别。</p>
  </div>
</template>

<style scoped>
.input-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.chat-sender {
  width: 100%;
}

.input-disclaimer {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--td-text-color-placeholder);
  text-align: center;
}

:deep(.t-chat-sender) {
  border-radius: 12px;
}

:deep(.t-chat-sender__textarea),
:deep(.t-textarea__inner) {
  border-radius: 12px;
}
</style>
