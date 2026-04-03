<script setup lang="ts">
import { computed, ref } from 'vue'
import { Chat as TChat, ChatAction as TChatAction, ChatContent as TChatContent } from '@tdesign-vue-next/chat'
import { useChat, type LlmLogEntry } from '../composables/useChat'
import { useUser } from '../composables/useUser'
import { ChevronUpIcon, ChevronDownIcon } from 'tdesign-icons-vue-next'

const { messages, isThinking, sendMessage } = useChat()
const { currentUser } = useUser()
const activeLogMessageId = ref<string | null>(null)

function formatToolStatus(status: 'running' | 'completed' | 'failed') {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '调用失败'
  return '调用中'
}

function formatToolSummary(summary?: string) {
  if (!summary) return ''
  return summary.length > 120 ? `${summary.slice(0, 117)}...` : summary
}

function formatToolArguments(args?: unknown) {
  if (args == null) return ''
  const raw = typeof args === 'string' ? args : JSON.stringify(args)
  if (!raw) return ''
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatLogTime(timestamp: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function formatLogDirection(direction: 'request' | 'response') {
  return direction === 'request' ? '请求参数' : '响应内容'
}

function stringifyLogPayload(payload: unknown) {
  return JSON.stringify(payload ?? {}, null, 2)
}

function openLogViewer(messageId: string) {
  activeLogMessageId.value = messageId
}

function handleLogDialogVisibilityChange(visible: boolean) {
  if (!visible) {
    activeLogMessageId.value = null
  }
}

function closeLogViewer() {
  activeLogMessageId.value = null
}

function openLatestLogViewer() {
  if (latestAssistantMessage.value) {
    activeLogMessageId.value = latestAssistantMessage.value.id
  }
}

const activeLogMessage = computed(() =>
  (messages?.value ?? []).find((message) => message.id === activeLogMessageId.value) ?? null,
)

const activeLogEntries = computed<LlmLogEntry[]>(() => activeLogMessage.value?.llmLogs ?? [])
const activeToolInvocations = computed(() => activeLogMessage.value?.toolInvocations ?? [])

const expandedLogs = ref<Set<string>>(new Set())

function toggleLogExpand(id: string) {
  if (expandedLogs.value.has(id)) {
    expandedLogs.value.delete(id)
  } else {
    expandedLogs.value.add(id)
  }
}

function expandAllLogs() {
  const ids = new Set<string>()
  activeLogEntries.value.forEach(entry => ids.add(entry.id))
  activeToolInvocations.value.forEach(tool => {
    ids.add('tool-' + tool.id)
    tool.children?.forEach(child => ids.add('tool-' + child.id))
  })
  expandedLogs.value = ids
}

function collapseAllLogs() {
  expandedLogs.value.clear()
}

const latestAssistantMessage = computed(() =>
  [...(messages?.value ?? [])].reverse().find((message) => message.role === 'assistant') ?? null,
)

const latestAssistantLogCount = computed(() => latestAssistantMessage.value?.llmLogs?.length ?? 0)

function getAvatarUrl(emoji: string) {
  // Check if it's already a URL
  if (emoji.startsWith('http') || emoji.startsWith('data:')) {
    return emoji;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="70">${emoji}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function parseConfirmationRequest(content: string) {
  try {
    if (content.includes('CONFIRMATION_REQUIRED')) {
      // Try to parse the JSON block if it exists
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/{[\s\S]*"status":\s*"CONFIRMATION_REQUIRED"[\s\S]*}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (parsed.status === 'CONFIRMATION_REQUIRED') {
          return parsed;
        }
      }
    }
  } catch (e) {
    // Ignore parsing errors
  }
  return null;
}

function handleConfirm(action: 'yes' | 'no') {
  if (action === 'yes') {
    sendMessage('I confirm. Please proceed with "confirmed": true.', currentUser.value?.id);
  } else {
    sendMessage('I cancel this action. Do not proceed.', currentUser.value?.id);
  }
}

const chatItems = computed(() =>
  (messages?.value ?? []).map((message, index, list) => ({
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    rawContent: message.content,
    confirmationRequest: message.role === 'assistant' ? parseConfirmationRequest(message.content) : null,
    toolInvocations: message.toolInvocations ?? [],
    llmLogs: message.llmLogs ?? [],
    showThinking: message.role === 'assistant' && isThinking.value && index === list.length - 1,
    name: message.role === 'assistant' ? 'BXDC.bot' : '你',
    datetime: formatTime(message.timestamp),
    avatar: message.role === 'assistant' ? getAvatarUrl('🤖') : getAvatarUrl(currentUser.value?.avatar || '👤'),
  } as any)),
)
</script>

<template>
  <div class="message-list">
    <div v-if="latestAssistantMessage" class="message-list-toolbar">
      <t-button size="small" variant="outline" @click="openLatestLogViewer">
        日志查看
      </t-button>
      <span class="message-list-toolbar-text">
        {{ latestAssistantLogCount > 0 ? `当前回复 ${latestAssistantLogCount} 条日志` : '当前回复暂无日志' }}
      </span>
    </div>

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
      <template #avatar="{ item }">
        <div class="chat-avatar" :class="item.role">
          <img :src="item.avatar" class="avatar-img" />
        </div>
      </template>

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

          <div v-if="item.confirmationRequest" class="confirmation-card">
            <div class="confirmation-header">
              <span class="confirmation-title">Action Confirmation Required</span>
            </div>
            <div class="confirmation-body">
              <p><strong>Action:</strong> {{ item.confirmationRequest.summary }}</p>
              <p><strong>Details:</strong> {{ item.confirmationRequest.details }}</p>
            </div>
            <div class="confirmation-actions">
              <t-button theme="default" variant="outline" @click="handleConfirm('no')">Cancel</t-button>
              <t-button theme="primary" @click="handleConfirm('yes')">Confirm & Execute</t-button>
            </div>
          </div>

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
              <div class="tool-status-main">
                <span class="tool-status-name">{{ tool.displayName }}</span>
                <t-tag
                  v-if="tool.executionLabel"
                  size="small"
                  variant="light"
                  :theme="tool.executionMode === 'OPENCLAW' ? 'warning' : 'primary'"
                >
                  {{ tool.executionLabel }}
                </t-tag>
                <span class="tool-status-separator">·</span>
                <span class="tool-status-text">{{ formatToolStatus(tool.status) }}</span>
                <span v-if="tool.status === 'completed'" class="tool-status-check">✓</span>
              </div>
              <div v-if="tool.arguments !== undefined" class="tool-status-args">
                参数：{{ formatToolArguments(tool.arguments) }}
              </div>
              <div v-if="tool.children?.length" class="tool-children-list">
                <div
                  v-for="child in tool.children"
                  :key="child.id"
                  class="tool-child-item"
                  :class="`tool-child-item--${child.status}`"
                >
                  <span class="tool-child-name">{{ child.displayName }}</span>
                  <span class="tool-status-separator">·</span>
                  <span class="tool-status-text">{{ formatToolStatus(child.status) }}</span>
                  <span v-if="child.summary" class="tool-status-separator">·</span>
                  <span v-if="child.summary" class="tool-child-summary">{{ formatToolSummary(child.summary) }}</span>
                  <span v-if="child.arguments !== undefined" class="tool-status-separator">·</span>
                  <span v-if="child.arguments !== undefined" class="tool-child-summary">参数：{{ formatToolArguments(child.arguments) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="item.role === 'assistant' && item.llmLogs.length"
            class="llm-log-actions"
          >
            <t-button size="small" variant="outline" @click="openLogViewer(item.id)">
              日志查看
            </t-button>
            <span class="llm-log-count">共 {{ item.llmLogs.length }} 条</span>
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

    <t-dialog
      :visible="activeLogMessageId !== null"
      header="调用日志"
      width="880px"
      top="48px"
      :footer="false"
      destroy-on-close
      @update:visible="handleLogDialogVisibilityChange"
      @close="closeLogViewer"
    >
      <div class="llm-log-viewer">
        <div class="llm-log-toolbar">
          <t-space>
            <t-button size="small" variant="text" @click="expandAllLogs">展开全部</t-button>
            <t-button size="small" variant="text" @click="collapseAllLogs">收起全部</t-button>
          </t-space>
        </div>
        <div v-if="activeLogEntries.length === 0 && activeToolInvocations.length === 0" class="llm-log-empty">
          当前消息暂无可展示的日志
        </div>
        <div v-else class="llm-log-list">
          <!-- Tool Invocations -->
          <div
            v-for="tool in activeToolInvocations"
            :key="'tool-' + tool.id"
            class="llm-log-item llm-log-item--tool"
          >
            <div class="llm-log-header" @click="toggleLogExpand('tool-' + tool.id)" style="cursor: pointer;">
              <div class="llm-log-meta">
                <t-tag theme="warning" variant="light">Tool</t-tag>
                <span class="llm-log-summary">{{ tool.displayName }} ({{ tool.name }})</span>
                <span class="tool-status-text" :class="`tool-status-item--${tool.status}`">{{ formatToolStatus(tool.status) }}</span>
              </div>
              <div class="llm-log-header-right">
                <t-button variant="text" shape="square" size="small">
                  <component :is="expandedLogs.has('tool-' + tool.id) ? ChevronUpIcon : ChevronDownIcon" />
                </t-button>
              </div>
            </div>
            
            <div v-show="expandedLogs.has('tool-' + tool.id)">
              <div class="llm-log-section">
                <div class="llm-log-section-title">调用参数</div>
                <pre class="llm-log-payload">{{ stringifyLogPayload(tool.arguments) }}</pre>
              </div>
            </div>
            
            <!-- Children Tools -->
            <div v-if="tool.children?.length" class="tool-children-logs">
              <div
                v-for="child in tool.children"
                :key="'tool-' + child.id"
                class="llm-log-item llm-log-item--tool-child"
              >
                <div class="llm-log-header" @click="toggleLogExpand('tool-' + child.id)" style="cursor: pointer;">
                  <div class="llm-log-meta">
                    <t-tag theme="warning" variant="outline">SubTool</t-tag>
                    <span class="llm-log-summary">{{ child.displayName }} ({{ child.name }})</span>
                    <span class="tool-status-text" :class="`tool-child-item--${child.status}`">{{ formatToolStatus(child.status) }}</span>
                  </div>
                  <div class="llm-log-header-right">
                    <t-button variant="text" shape="square" size="small">
                      <component :is="expandedLogs.has('tool-' + child.id) ? ChevronUpIcon : ChevronDownIcon" />
                    </t-button>
                  </div>
                </div>
                <div v-show="expandedLogs.has('tool-' + child.id)">
                  <div class="llm-log-section">
                    <div class="llm-log-section-title">调用参数</div>
                    <pre class="llm-log-payload">{{ stringifyLogPayload(child.arguments) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- LLM Logs -->
          <div
            v-for="entry in activeLogEntries"
            :key="entry.id"
            class="llm-log-item"
            :class="`llm-log-item--${entry.direction}`"
          >
            <div class="llm-log-header" @click="toggleLogExpand(entry.id)" style="cursor: pointer;">
              <div class="llm-log-meta">
                <t-tag :theme="entry.direction === 'request' ? 'primary' : 'success'" variant="light">
                  {{ formatLogDirection(entry.direction) }}
                </t-tag>
                <span class="llm-log-summary">{{ entry.summary }}</span>
              </div>
              <div class="llm-log-header-right">
                <span class="llm-log-time">{{ formatLogTime(entry.timestamp) }}</span>
                <t-button variant="text" shape="square" size="small">
                  <component :is="expandedLogs.has(entry.id) ? ChevronUpIcon : ChevronDownIcon" />
                </t-button>
              </div>
            </div>

            <div v-show="expandedLogs.has(entry.id)">
              <div v-if="entry.modelName" class="llm-log-model">
                模型：{{ entry.modelName }}
              </div>

              <div class="llm-log-section">
                <div class="llm-log-section-title">
                  {{ entry.direction === 'request' ? '送给大模型的参数' : '大模型返回的内容' }}
                </div>
                <pre class="llm-log-payload">{{ stringifyLogPayload(entry.direction === 'request' ? entry.request : entry.response) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  padding: 16px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 768px) {
  .message-list {
    padding: 24px 24px 8px;
  }
}

.chat-panel {
  flex: 1;
  min-height: 0;
}

.message-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.message-list-toolbar-text {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  align-self: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--td-text-color-secondary);
}

.tool-status-args {
  max-width: 560px;
  color: var(--td-text-color-placeholder);
  word-break: break-all;
}

.tool-status-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.tool-children-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 14px;
  padding-left: 10px;
  border-left: 2px solid var(--td-component-stroke);
}

.tool-child-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--td-text-color-secondary);
}

.tool-child-item--running {
  color: var(--td-brand-color);
}

.tool-child-item--failed {
  color: var(--td-error-color);
}

.tool-child-name,
.tool-child-summary {
  max-width: 320px;
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

.llm-log-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
}

.llm-log-count {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.llm-log-viewer {
  max-height: min(70vh, 720px);
  overflow: auto;
}

.llm-log-empty {
  color: var(--td-text-color-placeholder);
}

.llm-log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.llm-log-item {
  border: 1px solid var(--td-border-level-2-color);
  border-radius: var(--td-radius-medium);
  padding: 12px;
  background: var(--td-bg-color-container);
}

.llm-log-item--request {
  border-left: 4px solid var(--td-brand-color);
}

.llm-log-item--response {
  border-left: 4px solid var(--td-success-color);
}

.llm-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.llm-log-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.llm-log-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.llm-log-item--tool {
  border-left: 4px solid var(--td-warning-color);
}

.tool-children-logs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  margin-left: 16px;
  padding-left: 12px;
  border-left: 2px solid var(--td-component-stroke);
}

.llm-log-item--tool-child {
  border-left: none;
  background: var(--td-bg-color-page);
}

.llm-log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.llm-log-summary {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.llm-log-time,
.llm-log-model {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.llm-log-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.llm-log-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
}

.llm-log-payload {
  margin: 0;
  padding: 12px;
  overflow: auto;
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-page);
  color: var(--td-text-color-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
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

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background-color: #f0f0f0;
  overflow: hidden;
}

.chat-avatar.assistant {
  background-color: #e6f7ff;
}

.chat-avatar.user {
  background-color: #f6ffed;
}

.avatar-emoji {
  line-height: 1;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.confirmation-card {
  margin-top: 8px;
  border: 1px solid var(--td-border-level-2-color);
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-container);
  overflow: hidden;
  max-width: 400px;
}

.confirmation-header {
  padding: 8px 12px;
  background-color: var(--td-warning-color-1);
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.confirmation-title {
  font-weight: 600;
  color: var(--td-warning-color-6);
  font-size: 14px;
}

.confirmation-body {
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.confirmation-body p {
  margin: 0 0 8px 0;
}

.confirmation-body p:last-child {
  margin-bottom: 0;
}

.confirmation-actions {
  padding: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--td-border-level-1-color);
}
</style>
