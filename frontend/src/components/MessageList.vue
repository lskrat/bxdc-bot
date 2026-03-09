<script setup lang="ts">
import { computed } from 'vue'
import { Chat as TChat, ChatAction as TChatAction, ChatContent as TChatContent } from '@tdesign-vue-next/chat'
import { useChat } from '../composables/useChat'

const { messages, isThinking } = useChat()

function formatToolStatus(status: 'running' | 'completed' | 'failed') {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '调用失败'
  return '调用中'
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

const chatItems = computed(() =>
  (messages?.value ?? []).map((message, index, list) => ({
    id: message.id,
    role: message.role,
    content: '',
    rawContent: message.content,
    toolInvocations: message.toolInvocations ?? [],
    showThinking: message.role === 'assistant' && isThinking.value && index === list.length - 1,
    name: message.role === 'assistant' ? 'BXDC.bot' : '你',
    datetime: formatTime(message.timestamp),
  } as any)),
)
</script>

<template>
  <div class="message-list">
    <div
      v-if="chatItems.length === 0 && !isThinking"
      class="empty-state"
    >
      <span class="empty-hint">开始与 BXDC.bot 对话</span>
    </div>

    <TChat
      v-else
      class="chat-panel"
      :data="chatItems"
      layout="both"
      :auto-scroll="true"
      default-scroll-to="bottom"
      :show-scroll-button="true"
      :clear-history="false"
      :is-stream-load="false"
      :text-loading="false"
      :animation="'moving'"
    >
      <template #content="{ item }">
        <div class="message-content-block">
          <transition name="thinking-fade">
            <div v-if="item.showThinking" class="thinking-indicator">
              <span class="thinking-emoji">🤔</span>
              <span class="thinking-text">思考中</span>
              <span class="thinking-wave" />
            </div>
          </transition>

          <TChatContent
            :role="item.role"
            :content="
              item.role === 'assistant'
                ? { type: 'markdown', data: item.rawContent || '' }
                : item.rawContent || ''
            "
          />

          <div
            v-if="item.role === 'assistant' && item.toolInvocations.length"
            class="tool-status-list"
          >
            <div
              v-for="tool in item.toolInvocations"
              :key="tool.id"
              class="tool-status-item"
              :class="`tool-status-item--${tool.status}`"
            >
              <span class="tool-status-name">{{ tool.displayName }}</span>
              <span class="tool-status-separator">·</span>
              <span class="tool-status-text">{{ formatToolStatus(tool.status) }}</span>
              <span v-if="tool.status === 'completed'" class="tool-status-check">✓</span>
            </div>
          </div>
        </div>
      </template>

      <template #actions="{ item }">
        <TChatAction
          v-if="item.role === 'assistant' && item.rawContent"
          :content="item.rawContent"
          :operation-btn="['copy']"
        />
      </template>
    </TChat>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  padding: 16px 12px 8px;
}

@media (min-width: 768px) {
  .message-list {
    padding: 24px 24px 8px;
  }
}

.chat-panel {
  height: 100%;
}

.message-content-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-status-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
}

.tool-status-item {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--td-text-color-secondary);
}

.tool-status-item--running {
  color: var(--td-brand-color);
}

.tool-status-item--failed {
  color: var(--td-error-color);
}

.tool-status-name {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status-separator {
  opacity: 0.65;
}

.tool-status-check {
  color: var(--td-success-color);
  font-weight: 700;
}

.thinking-indicator {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 10px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(0, 82, 217, 0.08), rgba(0, 82, 217, 0.16));
  color: var(--td-text-color-secondary);
  animation: thinkingPulse 1.8s ease-in-out infinite;
}

.thinking-emoji {
  display: inline-block;
  font-size: 18px;
  animation: thinkingBob 1.4s ease-in-out infinite;
  transform-origin: center bottom;
}

.thinking-text {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.thinking-wave {
  position: relative;
  width: 48px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(0, 82, 217, 0.12);
}

.thinking-wave::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 40%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--td-brand-color), transparent);
  animation: thinkingWave 1.2s linear infinite;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 320px;
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
}

.empty-hint {
  font-size: 14px;
  color: var(--td-text-color-placeholder);
}

:deep(.t-chat) {
  height: 100%;
}

:deep(.t-chat__list) {
  padding-right: 8px;
  padding-bottom: 12px;
}

:deep(.t-chat__item) {
  margin-bottom: 20px;
}

:deep(.t-chat__content) {
  border-radius: var(--td-radius-large);
}

:deep(.t-chat__content-markdown pre) {
  border-radius: var(--td-radius-medium);
}

@keyframes thinkingBob {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-2px) rotate(-8deg);
  }
}

@keyframes thinkingPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(0, 82, 217, 0.08);
  }
  50% {
    box-shadow: 0 8px 20px 0 rgba(0, 82, 217, 0.14);
  }
}

@keyframes thinkingWave {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(260%);
  }
}

.thinking-fade-enter-active,
.thinking-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.thinking-fade-enter-from,
.thinking-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
