<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Chat as TChat, ChatContent as TChatContent } from '@tdesign-vue-next/chat'
import { useChat, type LlmLogEntry, type Message, type ToolInvocation, type ConfirmationRequest, type PollingStatus } from '../composables/useChat'
import { useUser } from '../composables/useUser'
import { useConversations } from '../composables/useConversations'
import { useSkillHub } from '../composables/useSkillHub'
import { useThinkingMode } from '../composables/useThinkingMode'
import UserAvatar from './UserAvatar.vue'
import ThinkingMode from './ThinkingMode.vue'
import AsyncTaskResultMessage from './AsyncTaskResultMessage.vue'
import BxdcbotRunResultMessage from './BxdcbotRunResultMessage.vue'
import { ChevronUpIcon, ChevronDownIcon, DownloadIcon, RefreshIcon, CopyIcon, ThumbUpIcon, ThumbDownIcon, Share1Icon } from 'tdesign-icons-vue-next'
import { apiUrl } from '../services/config'
import { fileService } from '../services/fileService'
import { downloadMarkdown, downloadPdf } from '../utils/chatDownload'
import { MessagePlugin } from 'tdesign-vue-next'

const { messages, isThinking, confirmSkillAction, updateConfirmationArguments } = useChat()
const { currentUser } = useUser()
const conversations = useConversations()
const { skills, fetchSkills } = useSkillHub()
const { getSession } = useThinkingMode()
const activeLogMessageId = ref<string | null>(null)
const expandedPollingKeys = ref(new Set<string>())
const downloadLoading = ref(false)
const expandedThinkBlockKeys = ref(new Set<string>())

// Scroll-to-top pagination for conversation history
const messageListRef = ref<HTMLElement | null>(null)
let chatListEl: HTMLElement | null = null

function ensureScrollListener() {
  if (chatListEl) return
  const list = messageListRef.value?.querySelector('.t-chat__list') as HTMLElement | null
  if (list) {
    chatListEl = list
    list.addEventListener('scroll', handleChatScroll)
  }
}

async function handleChatScroll() {
  const el = chatListEl
  if (!el) return
  if (el.scrollTop >= 50) return
  if (!conversations.hasMoreHistory.value) return
  if (conversations.isLoadingHistory.value) return
  if (conversations.isProcessing.value) return

  const oldScrollHeight = el.scrollHeight
  await conversations.loadMoreMessages(currentUser.value!.id)
  await nextTick()
  if (chatListEl) {
    chatListEl.scrollTop = chatListEl.scrollHeight - oldScrollHeight
  }
}

// 从通知中心跳转标记：进入页面时显示一个"已从通知进入"的 banner，几秒后自动消失
const showFromNotificationBanner = ref(false)
const fromNotificationTaskId = ref<string | null>(null)
try {
  const pending = sessionStorage.getItem('pendingTaskId')
  if (pending) {
    fromNotificationTaskId.value = pending
    showFromNotificationBanner.value = true
    sessionStorage.removeItem('pendingTaskId')
    setTimeout(() => { showFromNotificationBanner.value = false }, 6000)
  }
} catch {
  // ignore
}

let downloadAnchorObserver: MutationObserver | null = null

onMounted(() => {
  // 诊断标记：确认浏览器实际执行的是这版新代码（解决"改了不生效"的根因排查）
  console.log('%c[dl-fix] MessageList onMounted v16 — composedPath + shadow-aware interceptor', 'color:#0a0;font-weight:bold')
  fetchSkills()
  nextTick(() => {
    ensureScrollListener()
    // 首次改写已渲染的下载链接
    rewriteDownloadAnchors(document.body)
  })
  // 捕获阶段拦截文件下载链接点击：在浏览器 target=_blank 默认行为之前触发。
  document.addEventListener('click', handleDownloadLinkCapture, true)
  // MutationObserver 兜底：markdown 流式渲染会不断插入 <a>，且渲染器会在节点插入
  // *之后* 用 setAttribute 补加 target="_blank"。因此同时监听 childList（新增节点）
  // 和 attributes（target 属性变化），target 一出现立刻删掉，确保不会开新页签。
  downloadAnchorObserver = new MutationObserver((mutations) => {
    for (const mu of mutations) {
      if (mu.type === 'childList') {
        mu.addedNodes.forEach((node) => {
          if (node.nodeType === 1) rewriteDownloadAnchors(node as Element)
        })
      } else if (mu.type === 'attributes' && mu.target.nodeType === 1) {
        rewriteDownloadAnchors(mu.target as Element)
      }
    }
  })
  downloadAnchorObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['target'],
  })
})

onUnmounted(() => {
  chatListEl?.removeEventListener('scroll', handleChatScroll)
  chatListEl = null
  document.removeEventListener('click', handleDownloadLinkCapture, true)
  downloadAnchorObserver?.disconnect()
  downloadAnchorObserver = null
})

function formatToolStatus(status: 'running' | 'completed' | 'failed') {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '调用失败'
  return '调用中'
}

function formatPollingStatus(ps: PollingStatus): string {
  if (ps.status === 'COMPLETED') return '轮询结束'
  if (ps.status === 'FAILED' || ps.status === 'TIMEOUT') return '轮询错误'
  const count = ps.pollResponses.length
  if (count === 0) return '等待首次轮询'
  return `轮询第${count}次`
}

function formatToolArguments(args?: unknown) {
  if (args == null) return ''
  const raw = typeof args === 'string' ? args : JSON.stringify(args)
  if (!raw) return ''
  return raw
}

function formatToolSummary(summary?: string) {
  if (!summary) return ''
  return summary.length > 200 ? summary.slice(0, 200) + '...' : summary
}

/** Tool 返回正文（SSE `result`），在消息区与日志区展示 */
function formatToolResultText(result?: string) {
  if (result == null || String(result).length === 0) return ''
  return String(result)
}

interface DownloadInfo {
  url: string
  fileName: string
  size?: number
  /** user_files.id — 有值时直接复用 fileService.downloadFile(fileId)，与文件管理下载完全一致 */
  fileId?: number
}

/**
 * 从 tool.result 字符串中提取 downloadUrl 信息（兼容 JSON / 嵌套 output / 字符串化）。
 * 返回 null 表示没有下载链接。
 */
function parseDownloadInfo(result?: string): DownloadInfo | null {
  if (result == null) return null
  const raw = String(result)
  // 优先尝试解析为 JSON
  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    // 尝试从纯文本里用正则抓 downloadUrl（兜底）
    const m = raw.match(/"downloadUrl"\s*:\s*"([^"]+)"/)
    if (!m) return null
    const fileNameMatch = raw.match(/"originalFileName"\s*:\s*"([^"]+)"/)
      || raw.match(/"newFileName"\s*:\s*"([^"]+)"/)
    // 各文件工具的 id 字段名不一致：fileId / newFileId
    const idMatch = raw.match(/"fileId"\s*:\s*(\d+)/) || raw.match(/"newFileId"\s*:\s*(\d+)/)
    return {
      url: m[1] || '',
      fileName: fileNameMatch ? (fileNameMatch[1] || 'download') : 'download',
      fileId: idMatch ? Number(idMatch[1]) : undefined,
    }
  }
  // 解包 { success, output: {...} } 或 { output: "..." }
  if (payload && typeof payload === 'object') {
    if (payload.output && typeof payload.output === 'object') {
      payload = payload.output
    } else if (typeof payload.output === 'string') {
      try { payload = JSON.parse(payload.output) } catch { payload = null }
    }
  }
  if (!payload || typeof payload !== 'object') return null
  const url = typeof payload.downloadUrl === 'string' ? payload.downloadUrl : null
  if (!url) return null
  const fileName = (typeof payload.originalFileName === 'string' && payload.originalFileName)
    || (typeof payload.newFileName === 'string' && payload.newFileName)
    || 'download'
  const size = typeof payload.size === 'number' ? payload.size : undefined
  // 各文件工具的 id 字段名不一致：fileId / newFileId
  const fileId = typeof payload.fileId === 'number'
    ? payload.fileId
    : typeof payload.newFileId === 'number'
      ? payload.newFileId
      : undefined
  return { url, fileName, size, fileId }
}

/**
 * 触发 chat 内文件下载，效果与文件管理页完全一致。
 *
 * - 有 fileId：直接复用 fileService.downloadFile(fileId)，走和文件管理
 *   **完全相同**的代码路径（相对路径 /api/files/download/{id} + X-User-Id header，
 *   经 vite proxy 同源无 CORS）。
 * - 无 fileId（兜底）：用解析出的 downloadUrl。注意后端 buildDownloadUrl 返回的是
 *   绝对 URL（http://host:18080/...?token=xxx），直接 fetch 会跨端口触发 CORS，
 *   因此先剥离 origin 转成相对路径，让 vite proxy 转发。
 */
async function handleToolDownload(info: DownloadInfo): Promise<void> {
  if (downloadLoading.value) return
  downloadLoading.value = true
  try {
    // 优先用 fileId 复用文件管理的下载实现，保证效果完全一致
    if (typeof info.fileId === 'number') {
      await fileService.downloadFile(info.fileId)
      return
    }
    // 兜底：把绝对 URL 转相对路径（保留 path + query 的 token），避免跨端口 CORS
    let requestUrl = info.url
    try {
      const parsed = new URL(info.url, window.location.origin)
      requestUrl = parsed.pathname + parsed.search
    } catch {
      /* info.url 已是相对路径，原样使用 */
    }
    const res = await fetch(apiUrl(requestUrl), {
      headers: { 'X-User-Id': localStorage.getItem('user_id') || '' },
    })
    if (!res.ok) throw new Error(`下载失败: ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    // 优先用 Content-Disposition header 的文件名（与文件管理一致），兜底用解析出的 fileName
    const disposition = res.headers.get('Content-Disposition')
    const match = disposition?.match(/filename\*=UTF-8''(.+)/) || disposition?.match(/filename="?([^";]+)"?/)
    a.download = match?.[1]
      ? decodeURIComponent(match[1])
      : info.fileName && info.fileName !== 'download'
        ? info.fileName
        : 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (e: any) {
    MessagePlugin.error(e?.message || '下载失败')
  } finally {
    downloadLoading.value = false
  }
}

/**
 * 改写一个 DOM 子树内的文件下载链接，使其不再开新页签。
 *
 * 对每个 href 含 /api/files/download/{id} 的 <a>：
 *  1. 去掉 target（移除 _blank）→ 即便后续点击拦截失效，浏览器也只会"就地"请求，
 *     后端返回 Content-Disposition: attachment 时直接下载、不离开页面、无新页签。
 *  2. 在 <a> 上挂捕获阶段 click 监听 → preventDefault + 走 fileService blob 下载，
 *     效果与文件管理页完全一致。
 *  3. 用 data 标记避免重复处理（markdown 流式渲染会反复触发 observer）。
 */
function rewriteDownloadAnchors(root: Element): void {
  const anchors: HTMLAnchorElement[] = []
  if (root.tagName === 'A') anchors.push(root as HTMLAnchorElement)
  root.querySelectorAll?.('a[href*="/api/files/download/"]').forEach((a) => {
    anchors.push(a as HTMLAnchorElement)
  })
  for (const a of anchors) {
    const href = a.getAttribute('href') || ''
    if (!/\/api\/files\/download\/\d+/.test(href)) continue
    // 走浏览器原生下载，只去掉 target=_blank
    if (a.hasAttribute('target')) a.removeAttribute('target')
  }
}

/**
 * 文档级捕获阶段点击拦截（兜底，与 onDownloadAnchorClick 双保险）。
 *
 * 关键：用 e.composedPath() 检索事件路径上的 <a>，而不是 e.target.closest('a')——
 * 因为 TDesign markdown 渲染可能用了 Shadow DOM，普通 closest() 找不到 shadow
 * 内部的 <a>，但 click 事件配合 composed:true 会冒泡到 document，composedPath()
 * 会展开穿过 shadow boundary。
 */
function handleDownloadLinkCapture(e: MouseEvent): void {
  // 仅处理普通左键点击（不干预 Ctrl/Cmd/中键等用户主动新开行为）
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  const path = e.composedPath ? e.composedPath() : [e.target as Element]
  let anchor: HTMLAnchorElement | null = null
  for (const node of path) {
    // 仅当事件路径上的节点本身是 <a> 时才视为点中链接。
    // composedPath() 已展开 Shadow DOM：若用户点的是 shadow 内的链接，<a> 也会出现在 path 中。
    // 不能用祖先 querySelector('a') 盲搜——那会把"区域内存在下载链接"误判为"点中了下载链接"，
    // 导致点击消息区域任意位置都触发下载。
    if (node && (node as Element).tagName === 'A') { anchor = node as HTMLAnchorElement; break }
  }
  if (!anchor) return
  const href = anchor.getAttribute('href') || anchor.href || ''
  if (!href) return
  const m = href.match(/\/api\/files\/download\/(\d+)/)
  if (!m) return // 非文件下载链接（普通外链）→ 不干预，正常打开
  // 走浏览器原生下载（Content-Disposition: attachment），不再用 fetch+blob 拦截
  return
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function togglePollingResponse(key: string) {
  const next = new Set(expandedPollingKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedPollingKeys.value = next
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

// ── 执行块折叠（工具调用 + 确认卡片）──
// Per-message 手动覆盖状态：用户可手动展开/收起（仅在非 pending 状态下可操作）
// 用 reactive 对象而非 Map，避免 Vue 3 对 Map 的响应式追踪在模板函数调用中失效
const manualOverrideExpanded = reactive<Record<string, boolean>>({})

interface BlockState {
  hasAny: boolean
  hasPending: boolean
  hasRunning: boolean
  shouldExpand: boolean
  toolCount: number
  pendingCount: number
  thinkBlockCount: number
}

function getMessageBlockState(item: any, streaming: boolean = false): BlockState {
  const tools = (item.toolInvocations ?? []) as ToolInvocation[]
  const confs = (item.confirmations ?? []) as ConfirmationRequest[]
  const thinkBlocks = (item.thinkBlocks ?? [])
  const toolCount = tools.length
  const pendingCount = confs.filter((c: ConfirmationRequest) => c.status === 'pending').length
  const hasRunning = tools.some((t: ToolInvocation) => t.status === 'running')
    || thinkBlocks.some((tb: any) => tb.status === 'running')
  const hasPending = pendingCount > 0
  const hasThinkBlocks = thinkBlocks.length > 0
  const hasAny = toolCount > 0 || confs.length > 0 || hasThinkBlocks

  // 展开优先级：pending 强制展开 > 手动覆盖 > streaming/运行中 > 有think块 > 默认收起
  const manualOverride = manualOverrideExpanded[item.id]
  let shouldExpand: boolean
  if (hasPending) {
    shouldExpand = true
  } else if (manualOverride !== undefined) {
    shouldExpand = manualOverride
  } else if (hasRunning || streaming || hasThinkBlocks) {
    shouldExpand = true
  } else {
    shouldExpand = false
  }
  return { hasAny, hasPending, hasRunning, shouldExpand, toolCount, pendingCount, thinkBlockCount: thinkBlocks.length }
}

// ── Think block 折叠控制 ──
function isThinkBlockExpanded(thinkBlockId: string, status: string): boolean {
  if (status === 'running') return true
  return expandedThinkBlockKeys.value.has(thinkBlockId)
}

function toggleThinkBlockExpansion(thinkBlockId: string, status: string) {
  if (status === 'running') return
  const next = new Set(expandedThinkBlockKeys.value)
  if (next.has(thinkBlockId)) {
    next.delete(thinkBlockId)
  } else {
    next.add(thinkBlockId)
  }
  expandedThinkBlockKeys.value = next
}

function toggleBlockExpansion(itemId: string, hasPending: boolean) {
  if (hasPending) return
  if (manualOverrideExpanded[itemId] !== undefined) {
    manualOverrideExpanded[itemId] = !manualOverrideExpanded[itemId]
  } else {
    manualOverrideExpanded[itemId] = false
  }
}

function getBlockLabel(item: any): string {
  const state = getMessageBlockState(item)
  const parts: string[] = []
  if (state.toolCount > 0) {
    parts.push(`${state.toolCount} 次工具`)
  }
  if (state.thinkBlockCount > 0) {
    parts.push(`${state.thinkBlockCount} 段思考`)
  }
  if (state.pendingCount > 0) {
    parts.push(`${state.pendingCount} 项待确认`)
  }
  return `调用详情（${parts.join(' + ')}）`
}

function openLatestLogViewer() {
  if (latestAssistantMessage.value) {
    activeLogMessageId.value = latestAssistantMessage.value.id
  }
}

const activeLogMessage = computed(() =>
  (messages?.value ?? []).find((message) => message.id === activeLogMessageId.value) ?? null,
)

type LogViewerRow =
  | { key: string; variant: 'tool'; tool: ToolInvocation }
  | { key: string; variant: 'tool-child'; parent: ToolInvocation; child: ToolInvocation }
  | { key: string; variant: 'llm'; entry: LlmLogEntry }

function findToolInvocationSlot(
  tools: ToolInvocation[],
  id: string,
):
  | { variant: 'tool'; tool: ToolInvocation }
  | { variant: 'tool-child'; parent: ToolInvocation; child: ToolInvocation }
  | null {
  for (const t of tools) {
    if (t.id === id) return { variant: 'tool', tool: t }
    for (const c of t.children ?? []) {
      if (c.id === id) return { variant: 'tool-child', parent: t, child: c }
    }
  }
  return null
}

/**
 * 判断一个 tool 是否属于「自主规划任务里涉及轮询 / 单步长调用」的场景。
 * - pollingStatus：SSE 上报的实时轮询进度
 * - executionMode：后端写入的异步调度模式（POLLING 轮询 / SINGLE_CALLED 单步长调用）
 *
 * 命中后调用日志弹窗只展示主 skill，不再展开 sub-tool，避免日志被 sub-tool 刷屏。
 */
function isAsyncOrLongCall(tool: ToolInvocation): boolean {
  if (tool.pollingStatus) return true
  if (tool.executionMode === 'POLLING') return true
  if (tool.executionMode === 'SINGLE_CALLED') return true
  return false
}

function buildFallbackLogTimeline(message: Message) {
  const tools = message.toolInvocations ?? []
  const logs = message.llmLogs ?? []
  const entries: { kind: 'tool' | 'llm'; id: string }[] = []
  for (const t of tools) {
    entries.push({ kind: 'tool', id: t.id })
    // 仅在「非异步轮询/长调用」且「有二级调用」时才追加 sub-tool
    const isAsync = isAsyncOrLongCall(t)
    const hasChildren = (t.children?.length ?? 0) > 0
    if (!isAsync && hasChildren) {
      for (const c of t.children ?? []) {
        entries.push({ kind: 'tool', id: c.id })
      }
    }
  }
  for (const e of [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )) {
    entries.push({ kind: 'llm', id: e.id })
  }
  return entries
}

const logViewerRows = computed<LogViewerRow[]>(() => {
  const msg = activeLogMessage.value
  if (!msg) return []
  const tools = msg.toolInvocations ?? []
  const logs = msg.llmLogs ?? []
  const timeline =
    msg.logTimeline && msg.logTimeline.length > 0
      ? msg.logTimeline
      : buildFallbackLogTimeline(msg)

  const rows: LogViewerRow[] = []
  for (const step of timeline) {
    if (step.kind === 'llm') {
      const entry = logs.find((e) => e.id === step.id)
      if (entry) rows.push({ key: entry.id, variant: 'llm', entry })
      continue
    }
    const found = findToolInvocationSlot(tools, step.id)
    if (!found) continue
    if (found.variant === 'tool') {
      rows.push({ key: `tool-${found.tool.id}`, variant: 'tool', tool: found.tool })
    } else {
      // 自主规划任务里，如果父 skill 是「轮询/单步长调用」（Bxdcbot 自主规划 + 子 skill 长调用），
      // 则不在调用日志里展开子调用，只展示主 skill 的调用展示
      if (isAsyncOrLongCall(found.parent)) continue
      rows.push({
        key: `tool-${found.child.id}`,
        variant: 'tool-child',
        parent: found.parent,
        child: found.child,
      })
    }
  }
  return rows
})

const expandedLogs = ref<Set<string>>(new Set())
const expandedResultKeys = ref<Set<string>>(new Set())
const expandedChildKeys = ref<Set<string>>(new Set())
const expandedArgsKeys = ref<Set<string>>(new Set())

function toggleArgsExpansion(toolId: string) {
  const next = new Set(expandedArgsKeys.value)
  if (next.has(toolId)) {
    next.delete(toolId)
  } else {
    next.add(toolId)
  }
  expandedArgsKeys.value = next
}

function toggleResultExpansion(toolId: string) {
  const next = new Set(expandedResultKeys.value)
  if (next.has(toolId)) {
    next.delete(toolId)
  } else {
    next.add(toolId)
  }
  expandedResultKeys.value = next
}

function toggleChildExpansion(childId: string) {
  const next = new Set(expandedChildKeys.value)
  if (next.has(childId)) {
    next.delete(childId)
  } else {
    next.add(childId)
  }
  expandedChildKeys.value = next
}

function toggleLogExpand(id: string) {
  if (expandedLogs.value.has(id)) {
    expandedLogs.value.delete(id)
  } else {
    expandedLogs.value.add(id)
  }
}

function expandAllLogs() {
  const ids = new Set<string>()
  logViewerRows.value.forEach((row) => ids.add(row.key))
  expandedLogs.value = ids
}

function collapseAllLogs() {
  expandedLogs.value.clear()
}

const latestAssistantMessage = computed(() =>
  [...(messages?.value ?? [])].reverse().find((message) => message.role === 'assistant') ?? null,
)

const latestAssistantLogCount = computed(() => latestAssistantMessage.value?.llmLogs?.length ?? 0)

function normalizeEnumOptions(raw: unknown[]): { label: string; value: unknown }[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (typeof raw[0] === 'string') return raw.map(v => ({ label: String(v), value: v }))
  if (typeof raw[0] === 'number') return raw.map(v => ({ label: String(v), value: v }))
  if (typeof raw[0] === 'boolean') return raw.map(v => ({ label: String(v), value: v }))
  return raw as { label: string; value: unknown }[]
}

function resolveParamProperties(config: any): Record<string, any> | null {
  if (!config) return null
  const pc = config.parameterContract
  if (!pc) return null
  if (pc.properties && typeof pc.properties === 'object' && !Array.isArray(pc.properties)) {
    const keys = Object.keys(pc.properties)
    if (keys.length > 0) return pc.properties
  }
  const entries = Object.entries(pc)
  const hasSchemaProps = entries.some(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && 'type' in (v as any))
  if (hasSchemaProps) {
    const out: Record<string, any> = {}
    for (const [k, v] of entries) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v
    }
    return Object.keys(out).length > 0 ? out : null
  }
  return null
}

const formStates = reactive<Record<string, {
  values: Record<string, unknown>
  properties: Record<string, any> | null
  rawJson: string
  optionsCache: Record<string, { label: string; value: unknown }[]>
  loading: Record<string, boolean>
}>>({})

function getOrInitFormState(conf: ConfirmationRequest) {
  const existing = formStates[conf.toolCallId]
  if (existing && existing.properties !== null) return existing

  let skill = skills.value.find(s =>
    s.name === conf.skillName
    || s.name === conf.skillName.replace(/_/g, '-')
    || s.name === conf.skillName.replace(/-/g, '_')
  )

  if (!skill && existing) return existing

  if (!skill) {
    if (!existing) {
      formStates[conf.toolCallId] = {
        values: reactive({}),
        properties: null,
        rawJson: formatConfirmationArguments(conf.arguments),
        optionsCache: reactive({}),
        loading: reactive({}),
      }
    }
    return formStates[conf.toolCallId]
  }
  let properties: Record<string, any> | null = null
  if (skill) {
    try {
      let config = typeof skill.configuration === 'string' ? JSON.parse(skill.configuration) : skill.configuration
      if (config && typeof config.parameterContract === 'string') {
        try { config = { ...config, parameterContract: JSON.parse(config.parameterContract) } } catch { /* keep as-is */ }
      }
      properties = resolveParamProperties(config)
      console.log(`[skill] formState INIT: toolCallId=${conf.toolCallId} skillName=${conf.skillName}`, {
        propKeys: properties ? Object.keys(properties) : null,
      })
    } catch (e) { console.error(`[skill] formState INIT error: toolCallId=${conf.toolCallId}`, e); }
  }

  const llmArgs = (conf.arguments as Record<string, unknown>) || {}
  let values: Record<string, unknown> = {}
  if (properties) {
    for (const [key, prop] of Object.entries(properties)) {
      if (key in llmArgs && llmArgs[key] !== undefined && llmArgs[key] !== null) {
        values[key] = llmArgs[key]
      } else if ((prop as any).default !== undefined) {
        values[key] = (prop as any).default
      } else {
        values[key] = ''
      }
    }
  }

  formStates[conf.toolCallId] = {
    values: reactive(values),
    properties,
    rawJson: formatConfirmationArguments(conf.arguments),
    optionsCache: reactive({}),
    loading: reactive({}),
  }

  if (properties) {
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).enumSource) fetchEnumSource(conf.toolCallId, key, prop)
    }
  }

  return formStates[conf.toolCallId]
}

async function fetchEnumSource(toolCallId: string, key: string, prop: Record<string, unknown>, searchQuery = '') {
  const state = formStates[toolCallId]
  if (!state) return
  state.loading[key] = true
  try {
    const body = JSON.stringify({ ...(prop.enumSource as Record<string, unknown>), searchQuery })
    const res = await fetch(apiUrl('/api/skills/enum-source'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (res.ok) {
      state.optionsCache[key] = await res.json()
      console.log(`[skill] enumSource OK: toolCallId=${toolCallId} key=${key} count=${state.optionsCache[key]?.length ?? 0}`)
    } else {
      console.warn(`[skill] enumSource HTTP ${res.status}: toolCallId=${toolCallId} key=${key}`)
      state.optionsCache[key] = []
    }
  } catch (e) {
    console.error(`[skill] enumSource FAILED: toolCallId=${toolCallId} key=${key}`, e)
    state.optionsCache[key] = []
  } finally {
    state.loading[key] = false
  }
}

function normalizeAdjustedParams(
  values: Record<string, unknown>,
  properties: Record<string, any>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(values)) {
    const prop = properties[key]
    if (!prop) { out[key] = val; continue }
    if (prop.type === 'integer' || prop.type === 'number') {
      if (val === '' || val === undefined || val === null) {
        if (prop.default !== undefined) {
          out[key] = prop.default
        }
        continue
      }
      const n = Number(val)
      if (Number.isFinite(n)) {
        out[key] = prop.type === 'integer' ? Math.trunc(n) : n
      } else if (prop.default !== undefined) {
        out[key] = prop.default
      }
    } else if (prop.type === 'boolean') {
      if (typeof val === 'boolean') {
        out[key] = val
      } else if (typeof val === 'string') {
        const lower = val.trim().toLowerCase()
        if (lower === 'true' || lower === '1') out[key] = true
        else if (lower === 'false' || lower === '0' || lower === '') out[key] = false
        else if (prop.default !== undefined) out[key] = prop.default
      }
    } else {
      out[key] = val
    }
  }
  return out
}

function handleConfirmation(conf: ConfirmationRequest, confirmed: boolean) {
  const toolCallId = conf.toolCallId;
  const sessionId = conf.sessionId;
  console.log(`[DEBUG-confirmation] handleConfirmation called: toolCallId=${toolCallId}, confirmed=${confirmed}, sessionId=${sessionId}`);
  
  if (confirmed) {
    const formState = formStates[toolCallId]
    if (formState) {
      let adjustedParams: Record<string, unknown>
      if (formState.properties) {
        const rawValues = { ...formState.values }
        adjustedParams = normalizeAdjustedParams(formState.values, formState.properties)
        console.log(`[skill] confirm BUTTON params: toolCallId=${toolCallId}`, {
          rawValues,
          adjustedParams,
        })
      } else {
        try {
          adjustedParams = JSON.parse(formState.rawJson)
        } catch {
          adjustedParams = {}
        }
        console.log(`[skill] confirm BUTTON (raw JSON): toolCallId=${toolCallId}`, {
          rawJson: formState.rawJson.slice(0, 300),
          adjustedParams,
        })
      }
      updateConfirmationArguments(toolCallId, adjustedParams)
      confirmSkillAction(toolCallId, sessionId, true, adjustedParams)
      return
    }
  }
  confirmSkillAction(toolCallId, sessionId, confirmed)
}

function formatConfirmationArguments(args?: unknown): string {
  if (args === undefined || args === null) return ''
  if (typeof args === 'string') return args.trim() ? args : ''
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

function hasConfirmationArguments(args?: unknown): boolean {
  if (args === undefined || args === null) return false
  if (typeof args === 'string') return args.trim().length > 0
  if (Array.isArray(args)) return args.length > 0
  if (typeof args === 'object') return Object.keys(args as object).length > 0
  return true
}

function confirmationHeaderTitle(conf: ConfirmationRequest): string {
  if (conf.status === 'pending') return '需要确认执行'
  if (conf.status === 'cancelled') return '已取消'
  if (conf.status === 'expired') return '已过期'
  if (conf.status === 'confirmed') {
    if (conf.executionOutcome === 'completed') return '执行已完成'
    if (conf.executionOutcome === 'failed') return '执行失败'
    return '已确认'
  }
  return ''
}

function confirmationBadgeText(conf: ConfirmationRequest): string {
  if (conf.status !== 'confirmed') return ''
  if (conf.executionOutcome === 'completed') return '执行已完成'
  if (conf.executionOutcome === 'failed') return '执行失败'
  return '已确认，执行中...'
}

function confirmationCardClass(conf: ConfirmationRequest): string {
  const base = `confirmation-card--${conf.status}`
  if (conf.status !== 'confirmed') return base
  if (conf.executionOutcome === 'completed') return `${base} confirmation-card--done`
  if (conf.executionOutcome === 'failed') return `${base} confirmation-card--error`
  return base
}

function confirmationBadgeClass(conf: ConfirmationRequest): string {
  if (conf.executionOutcome === 'completed') return 'confirmation-badge--done'
  if (conf.executionOutcome === 'failed') return 'confirmation-badge--failed'
  return 'confirmation-badge--confirmed'
}

const chatItems = computed(() =>
  (messages?.value ?? []).map((message, index, list) => ({
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    rawContent: message.content,
    confirmations: message.confirmations ?? [],
    toolInvocations: message.toolInvocations ?? [],
    llmLogs: message.llmLogs ?? [],
    thinkBlocks: (message as any).thinkBlocks ?? [],
    contentSegments: (message as any).contentSegments,
    sessionId: message.sessionId,
    showThinking: message.role === 'assistant' && isThinking.value && index === list.length - 1,
    isLast: index === list.length - 1,
    name: message.role === 'assistant' ? 'BXDC.bot' : '你',
    datetime: formatTime(message.timestamp),
    avatarEmoji: message.role === 'assistant' ? '🤖' : (currentUser.value?.avatar || '👤'),
    // async-task-result-echo-to-chat: 透传异步任务结果专用字段
    source: message.source,
    asyncTaskId: message.asyncTaskId,
    parentToolId: message.parentToolId,
    parentSkillId: message.parentSkillId,
    summaryPending: message.summaryPending,
    summaryText: message.summaryText,
    summaryGeneratedAt: message.summaryGeneratedAt,
  } as any)),
)

// Set up scroll listener when chat items first appear (initial history load)
watch(chatItems, (items) => {
  if (items.length > 0) {
    nextTick(() => ensureScrollListener())
  } else {
    if (chatListEl) {
      chatListEl.removeEventListener('scroll', handleChatScroll)
      chatListEl = null
    }
  }
})

async function handleDownload(format: 'md' | 'pdf', msg: Message) {
  downloadLoading.value = true
  try {
    if (format === 'md') {
      downloadMarkdown(msg)
    } else {
      await downloadPdf(msg)
    }
  } catch (e) {
    console.error('Download failed:', e)
    MessagePlugin.error('下载失败，请重试')
  } finally {
    downloadLoading.value = false
  }
}

async function copyContent(text: string) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // 隐藏 textarea，避免页面闪一下
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) {
      MessagePlugin.success('已复制到剪贴板')
    } else {
      MessagePlugin.error('复制失败，请手动选择文本')
    }
  } catch {
    MessagePlugin.error('复制失败，请手动选择文本')
  }
}
</script>

<template>
  <div class="message-list" ref="messageListRef">
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

    <template v-else>
      <transition name="banner-fade">
        <div v-if="showFromNotificationBanner" class="from-notification-banner">
          <span class="banner-icon">消息</span>
          <span class="banner-text">
            已从任务通知进入
            <span v-if="fromNotificationTaskId" class="banner-task-id">#{{ fromNotificationTaskId }}</span>
          </span>
        </div>
      </transition>

      <div v-if="conversations.isLoadingHistory.value" class="load-more-indicator">
        <t-loading size="small" /> 加载历史消息...
      </div>

      <TChat
      class="chat-panel"
      :data="chatItems"
      layout="both"
      :auto-scroll="true"
      default-scroll-to="bottom"
      :show-scroll-button="true"
      :clear-history="false"
      :is-stream-load="true"
      :text-loading="false"
      :animation="'moving'"
    >
      <template #avatar="{ item }">
        <div class="chat-avatar-slot">
          <UserAvatar
            :avatar="item.avatarEmoji"
            :size="24"
            :variant="item.role === 'assistant' ? 'chatAssistant' : 'chatUser'"
          />
        </div>
      </template>

      <template #content="{ item }">
        <div class="message-content-block">
          <!-- 思考模式组件：始终只用 ThinkingMode，不再显示老的小思考框 -->
          <ThinkingMode
            v-if="item.sessionId && getSession(item.sessionId)"
            :nodes="getSession(item.sessionId)?.nodes || []"
            :is-active="getSession(item.sessionId)?.isActive || false"
          />

          <!-- 兜底：未进入 ThinkingMode session 时，构造一个初始 session 触发显示 -->
          <ThinkingMode
            v-else-if="item.showThinking"
            :nodes="[]"
            :is-active="true"
          />

          <div class="content-wrapper">
            <!-- async-task-result-echo-to-chat: 异步任务结果消息走专用 UI（独立于普通 markdown 气泡） -->
            <AsyncTaskResultMessage
              v-if="item.role === 'assistant' && item.source === 'ASYNC_TASK_RESULT'"
              :status="(item.rawContent || '').match(/状态：([A-Z_]+)/)?.[1] || 'FAILED'"
              :content="item.rawContent || ''"
              :async-task-id="item.asyncTaskId"
              :summary-pending="item.summaryPending"
              :summary-text="item.summaryText"
            />
            <BxdcbotRunResultMessage
              v-else-if="item.role === 'assistant' && item.source === 'BXDCBOT_RUN_RESULT'"
              :content="item.rawContent || ''"
              :run-id="item.parentToolId ?? item.id"
              :message-id="item.id"
              :llm-log-count="item.llmLogs?.length ?? 0"
              :tool-invocations="item.toolInvocations"
              @open-log="openLogViewer"
            />
            <!-- 内嵌段落：文字与 think 块按顺序穿插 -->
            <template v-else-if="item.role === 'assistant' && item.contentSegments && item.contentSegments.length > 0">
              <template v-for="(seg, si) in item.contentSegments" :key="si">
                <TChatContent v-if="seg.type === 'text'" role="assistant" :content="{ type: 'markdown', data: seg.text }" />
                <div v-else-if="seg.type === 'think'" class="think-block think-block--inline" :class="`think-block--${item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status || 'completed'}`">
                  <div class="think-block-header" @click="toggleThinkBlockExpansion(seg.thinkId, item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status || 'completed')">
                    <span class="think-block-arrow">{{ isThinkBlockExpanded(seg.thinkId, item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status || 'completed') ? '▾' : '▸' }}</span>
                    <span class="think-block-label">思考</span>
                    <span v-if="item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status === 'running'" class="think-block-status think-block-status--running">running</span>
                    <span v-else-if="item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status === 'completed'" class="think-block-status">done</span>
                    <span v-else class="think-block-status think-block-status--failed">failed</span>
                  </div>
                  <div v-show="isThinkBlockExpanded(seg.thinkId, item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.status || 'completed')" class="think-block-body">
                    <TChatContent v-if="item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.content" role="assistant" :content="{ type: 'markdown', data: item.thinkBlocks?.find((t: any) => t.id === seg.thinkId)?.content }" />
                    <div v-else class="think-block-empty">等待子Agent输出...</div>
                  </div>
                </div>
              </template>
            </template>
            <TChatContent
              v-else
              :role="item.role"
              :content="
                item.role === 'assistant'
                  ? { type: 'markdown', data: item.rawContent || '' }
                  : item.rawContent || ''
              "
            />
            <span
              v-if="item.role === 'assistant' && isThinking && item.isLast && item.rawContent && item.source !== 'ASYNC_TASK_RESULT' && item.source !== 'BXDCBOT_RUN_RESULT'"
              class="typewriter-cursor"
            />

          </div>

          <div
            v-if="item.role === 'assistant' && getMessageBlockState(item, isThinking && item.isLast).hasAny"
            class="execution-block"
          >
            <div
              class="execution-block-header"
              :class="{ 'execution-block-header--disabled': getMessageBlockState(item, isThinking && item.isLast).hasPending }"
              @click="toggleBlockExpansion(item.id, getMessageBlockState(item, isThinking && item.isLast).hasPending)"
            >
              <span class="execution-block-arrow">{{ getMessageBlockState(item, isThinking && item.isLast).shouldExpand ? '▾' : '▸' }}</span>
              <span class="execution-block-label">{{ getBlockLabel(item) }}</span>
            </div>
            <div v-show="getMessageBlockState(item, isThinking && item.isLast).shouldExpand" class="execution-block-body">
              <div
                v-for="conf in item.confirmations"
                :key="conf.toolCallId"
                class="confirmation-card"
            :class="confirmationCardClass(conf)"
          >
            <div class="confirmation-header">
              <span class="confirmation-title">{{ confirmationHeaderTitle(conf) }}</span>
            </div>
            <div class="confirmation-body">
              <p><strong>技能：</strong>{{ conf.skillName }}</p>
              <p><strong>操作：</strong>{{ conf.summary }}</p>
              <p v-if="conf.details"><strong>详情：</strong>{{ conf.details }}</p>
              <!-- pending + has arguments → always editable -->
              <template v-if="conf.status === 'pending' && hasConfirmationArguments(conf.arguments)">
                <div class="confirmation-params">
                  <div class="confirmation-params-label">执行参数（可修改）</div>
                  <!-- has parameterContract → typed fields -->
                  <template v-if="getOrInitFormState(conf)?.properties">
                    <div v-for="(prop, key) in getOrInitFormState(conf)!.properties!" :key="key" class="confirmation-inline-field">
                      <label>{{ (prop as any).description || key }}</label>
                      <t-select v-if="(prop as any).enum" v-model="getOrInitFormState(conf)!.values[key]" :options="normalizeEnumOptions((prop as any).enum)" filterable size="small" />
                      <t-select v-else-if="(prop as any).enumSource" v-model="getOrInitFormState(conf)!.values[key]" :options="(getOrInitFormState(conf)!.optionsCache[key] || []) as any" :loading="getOrInitFormState(conf)!.loading[key]" filterable remote :remote-method="(kw: string) => fetchEnumSource(conf.toolCallId, key, prop as Record<string, unknown>, kw)" size="small" />
                      <t-input-number v-else-if="(prop as any).type === 'number' || (prop as any).type === 'integer'" v-model="getOrInitFormState(conf)!.values[key]" size="small" />
                      <t-input v-else v-model="getOrInitFormState(conf)!.values[key]" size="small" />
                    </div>
                  </template>
                  <!-- no parameterContract → raw JSON textarea -->
                  <t-textarea v-else v-model="getOrInitFormState(conf)!.rawJson" :autosize="{ minRows: 2, maxRows: 6 }" size="small" />
                </div>
              </template>
              <!-- confirmed/cancelled/expired → plain display -->
              <template v-else>
                <div v-if="hasConfirmationArguments(conf.arguments)" class="confirmation-params">
                  <div class="confirmation-params-label">本次调用参数</div>
                  <pre class="confirmation-params-pre">{{ formatConfirmationArguments(conf.arguments) }}</pre>
                </div>
              </template>
            </div>
            <div v-if="conf.status === 'pending'" class="confirmation-actions">
              <t-button theme="default" variant="outline" @click="handleConfirmation(conf, false)">取消</t-button>
              <t-button theme="primary" @click="handleConfirmation(conf, true)">确认执行</t-button>
            </div>
            <div v-else class="confirmation-status-badge">
              <span
                v-if="conf.status === 'confirmed'"
                class="confirmation-badge"
                :class="confirmationBadgeClass(conf)"
              >{{ confirmationBadgeText(conf) }}</span>
              <span v-else-if="conf.status === 'cancelled'" class="confirmation-badge confirmation-badge--cancelled">已取消</span>
              <span v-else class="confirmation-badge confirmation-badge--expired">已过期</span>
            </div>
          </div>

          <div
            v-if="item.role === 'assistant' && (item.toolInvocations?.length ?? 0) > 0"
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
              <div v-if="tool.pollingStatus" class="tool-polling-status">
                <div class="tool-polling-header" @click="togglePollingResponse(tool.id)">
                  <span class="tool-polling-arrow">{{ expandedPollingKeys.has(tool.id) ? '▼' : '▶' }}</span>
                  <t-tag size="small" theme="warning" variant="light">
                    {{ formatPollingStatus(tool.pollingStatus) }}
                  </t-tag>
                  <span v-if="tool.pollingStatus.elapsedSeconds > 0" class="tool-polling-elapsed">⏱ {{ formatElapsed(tool.pollingStatus.elapsedSeconds) }}</span>
                  <span v-if="tool.pollingStatus.pollResponses.length" class="tool-polling-count">{{ tool.pollingStatus.pollResponses.length }} 次响应</span>
                </div>
                <div v-if="expandedPollingKeys.has(tool.id) && tool.pollingStatus.pollResponses.length" class="tool-polling-responses">
                  <div
                    v-for="(resp, idx) in tool.pollingStatus.pollResponses"
                    :key="idx"
                    class="tool-polling-resp-item"
                  >
                    <span class="tool-polling-resp-time">{{ resp.time }}</span>
                    <pre class="tool-polling-resp-body">{{ resp.body }}</pre>
                  </div>
                </div>
              </div>
              <div v-if="tool.arguments !== undefined" class="tool-status-args">
                <div class="tool-args-header" @click="toggleArgsExpansion(tool.id)">
                  <span class="tool-result-arrow">{{ expandedArgsKeys.has(tool.id) ? '▼' : '▶' }}</span>
                  <span class="tool-status-result-label">查看调用参数</span>
                </div>
                <div v-if="expandedArgsKeys.has(tool.id)">
                  <pre class="tool-status-result-body">{{ formatToolArguments(tool.arguments) }}</pre>
                </div>
              </div>
              <div
                v-if="formatToolResultText(tool.result)"
                class="tool-status-result"
              >
                <div
                  v-if="parseDownloadInfo(tool.result)"
                  class="tool-download-card"
                >
                  <div class="tool-download-info">
                    <div class="tool-download-name">📎 {{ parseDownloadInfo(tool.result)!.fileName }}</div>
                    <div v-if="formatSize(parseDownloadInfo(tool.result)!.size)" class="tool-download-size">
                      {{ formatSize(parseDownloadInfo(tool.result)!.size) }}
                    </div>
                  </div>
                  <a
                    :href="parseDownloadInfo(tool.result)!.url"
                    :download="parseDownloadInfo(tool.result)!.fileName"
                    @click.prevent="handleToolDownload(parseDownloadInfo(tool.result)!)"
                    class="tool-download-btn"
                  >下载</a>
                </div>
                <div class="tool-result-header" @click="toggleResultExpansion(tool.id)">
                  <span class="tool-result-arrow">{{ expandedResultKeys.has(tool.id) ? '▼' : '▶' }}</span>
                  <span class="tool-status-result-label">查看返回内容</span>
                </div>
                <div v-if="expandedResultKeys.has(tool.id)">
                  <pre class="tool-status-result-body">{{ formatToolResultText(tool.result) }}</pre>
                </div>
              </div>
              <div v-if="tool.children?.length" class="tool-children-list">
                <div
                  v-for="child in tool.children"
                  :key="child.id"
                  class="tool-child-block"
                >
                  <div
                    class="tool-child-item"
                    :class="`tool-child-item--${child.status}`"
                    @click="toggleChildExpansion(child.id)"
                  >
                    <span class="tool-child-arrow">{{ expandedChildKeys.has(child.id) ? '▼' : '▶' }}</span>
                    <span class="tool-child-name">{{ child.displayName }}</span>
                    <span class="tool-status-separator">·</span>
                    <span class="tool-status-text">{{ formatToolStatus(child.status) }}</span>
                    <span v-if="child.summary" class="tool-status-separator">·</span>
                    <span v-if="child.summary" class="tool-child-summary">{{ formatToolSummary(child.summary) }}</span>
                  </div>
                  <div
                    v-if="expandedChildKeys.has(child.id) && child.arguments !== undefined"
                    class="tool-child-result"
                  >
                    <div class="tool-child-args-label">调用参数</div>
                    <pre class="tool-status-result-body">{{ formatToolArguments(child.arguments) }}</pre>
                  </div>
                  <div
                    v-if="expandedChildKeys.has(child.id) && formatToolResultText(child.result)"
                    class="tool-child-result"
                  >
                    <pre class="tool-status-result-body">{{ formatToolResultText(child.result) }}</pre>
                  </div>
                </div>
              </div>

            </div>
          </div>
            </div>
          </div>

        </div>
      </template>

      <template #actions="{ item }">
        <!-- 日志查看：放在 重新生成 按钮上方，样式与调用日志模块一致 -->
        <div
          v-if="item.role === 'assistant' && item.llmLogs?.length"
          class="llm-log-actions--inline"
        >
          <t-button size="small" variant="outline" @click="openLogViewer(item.id)">
            日志查看
          </t-button>
          <span class="llm-log-count">共 {{ item.llmLogs.length }} 条</span>
        </div>
        <div v-if="item.role === 'assistant' && item.rawContent" class="chat-actions-bar">
          <t-tooltip content="重新生成">
            <t-button theme="default" size="small" variant="text">
              <template #icon><RefreshIcon /></template>
            </t-button>
          </t-tooltip>
          <span class="chat-actions-divider"></span>
          <t-tooltip content="复制">
            <t-button theme="default" size="small" variant="text" @click="copyContent(item.rawContent)">
              <template #icon><CopyIcon /></template>
            </t-button>
          </t-tooltip>
          <t-tooltip content="点赞">
            <t-button theme="default" size="small" variant="text">
              <template #icon><ThumbUpIcon /></template>
            </t-button>
          </t-tooltip>
          <t-tooltip content="踩">
            <t-button theme="default" size="small" variant="text">
              <template #icon><ThumbDownIcon /></template>
            </t-button>
          </t-tooltip>
          <span class="chat-actions-divider"></span>
          <t-tooltip content="分享">
            <t-button theme="default" size="small" variant="text">
              <template #icon><Share1Icon /></template>
            </t-button>
          </t-tooltip>
          <span class="chat-actions-divider"></span>
          <t-dropdown trigger="click" :disabled="downloadLoading">
            <t-tooltip content="下载">
              <t-button theme="default" size="small" variant="text" :loading="downloadLoading">
                <template #icon><DownloadIcon /></template>
              </t-button>
            </t-tooltip>
            <template #dropdown>
              <t-dropdown-menu>
                <t-dropdown-item @click="handleDownload('md', messages?.find(m => m.id === item.id)!)">Markdown (.md)</t-dropdown-item>
                <t-dropdown-item @click="handleDownload('pdf', messages?.find(m => m.id === item.id)!)">PDF (.pdf)</t-dropdown-item>
              </t-dropdown-menu>
            </template>
          </t-dropdown>
        </div>
      </template>
    </TChat>
    </template>

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
        <div v-if="logViewerRows.length === 0" class="llm-log-empty">
          当前消息暂无可展示的日志
        </div>
        <div v-else class="llm-log-list">
          <template v-for="row in logViewerRows" :key="row.key">
            <div
              v-if="row.variant === 'tool'"
              class="llm-log-item llm-log-item--tool"
            >
              <div class="llm-log-header" @click="toggleLogExpand(row.key)" style="cursor: pointer;">
                <div class="llm-log-meta">
                  <t-tag theme="warning" variant="light">Tool</t-tag>
                  <span class="llm-log-summary">{{ row.tool.displayName }} ({{ row.tool.name }})</span>
                  <span class="tool-status-text" :class="`tool-status-item--${row.tool.status}`">{{ formatToolStatus(row.tool.status) }}</span>
                </div>
                <div class="llm-log-header-right">
                  <span v-if="activeLogMessage" class="llm-log-time">{{ formatTime(activeLogMessage.timestamp) }}</span>
                  <t-button variant="text" shape="square" size="small">
                    <component :is="expandedLogs.has(row.key) ? ChevronUpIcon : ChevronDownIcon" />
                  </t-button>
                </div>
              </div>

              <div v-show="expandedLogs.has(row.key)">
                <div class="llm-log-section">
                  <div class="llm-log-section-title">调用参数</div>
                  <pre class="llm-log-payload">{{ stringifyLogPayload(row.tool.arguments) }}</pre>
                </div>
                <div
                  v-if="row.tool.result != null && String(row.tool.result).length > 0"
                  class="llm-log-section"
                >
                  <div class="llm-log-section-title">返回内容</div>
                  <pre class="llm-log-payload">{{ row.tool.result }}</pre>
                </div>
              </div>
            </div>

            <div
              v-else-if="row.variant === 'tool-child'"
              class="llm-log-item llm-log-item--tool-child"
            >
              <div class="llm-log-header" @click="toggleLogExpand(row.key)" style="cursor: pointer;">
                <div class="llm-log-meta">
                  <t-tag theme="warning" variant="outline">SubTool</t-tag>
                  <span class="llm-log-summary">{{ row.child.displayName }} ({{ row.child.name }})</span>
                  <span class="tool-status-text" :class="`tool-child-item--${row.child.status}`">{{ formatToolStatus(row.child.status) }}</span>
                </div>
                <div class="llm-log-header-right">
                  <span v-if="activeLogMessage" class="llm-log-time">{{ formatTime(activeLogMessage.timestamp) }}</span>
                  <t-button variant="text" shape="square" size="small">
                    <component :is="expandedLogs.has(row.key) ? ChevronUpIcon : ChevronDownIcon" />
                  </t-button>
                </div>
              </div>
              <div v-show="expandedLogs.has(row.key)">
                <div class="llm-log-section">
                  <div class="llm-log-section-title">调用参数</div>
                  <pre class="llm-log-payload">{{ stringifyLogPayload(row.child.arguments) }}</pre>
                </div>
                <div
                  v-if="row.child.result != null && String(row.child.result).length > 0"
                  class="llm-log-section"
                >
                  <div class="llm-log-section-title">返回内容</div>
                  <pre class="llm-log-payload">{{ row.child.result }}</pre>
                </div>
              </div>
            </div>

            <div
              v-else
              class="llm-log-item"
              :class="`llm-log-item--${row.entry.direction}`"
            >
              <div class="llm-log-header" @click="toggleLogExpand(row.key)" style="cursor: pointer;">
                <div class="llm-log-meta">
                  <t-tag :theme="row.entry.direction === 'request' ? 'primary' : 'success'" variant="light">
                    {{ formatLogDirection(row.entry.direction) }}
                  </t-tag>
                  <span class="llm-log-summary">{{ row.entry.summary }}</span>
                </div>
                <div class="llm-log-header-right">
                  <span class="llm-log-time">{{ formatLogTime(row.entry.timestamp) }}</span>
                  <t-button variant="text" shape="square" size="small">
                    <component :is="expandedLogs.has(row.key) ? ChevronUpIcon : ChevronDownIcon" />
                  </t-button>
                </div>
              </div>

              <div v-show="expandedLogs.has(row.key)">
                <div v-if="row.entry.modelName" class="llm-log-model">
                  模型：{{ row.entry.modelName }}
                </div>

                <div class="llm-log-section">
                  <div class="llm-log-section-title">
                    {{ row.entry.direction === 'request' ? '送给大模型的参数' : '大模型返回的内容' }}
                  </div>
                  <pre class="llm-log-payload">{{ stringifyLogPayload(row.entry.direction === 'request' ? row.entry.request : row.entry.response) }}</pre>
                </div>
              </div>
            </div>
          </template>
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

.load-more-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--td-text-color-placeholder);
  font-size: 13px;
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

.execution-block {
  border: 1px solid var(--td-border-level-2-color);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}

.execution-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  user-select: none;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.execution-block-header:hover {
  background: var(--td-bg-color-container-hover);
}

.execution-block-header--disabled {
  cursor: default;
  opacity: 0.7;
}

.execution-block-header--disabled:hover {
  background: var(--td-bg-color-secondarycontainer);
}

.execution-block-arrow {
  font-size: 11px;
  flex-shrink: 0;
}

.execution-block-label {
  font-weight: 500;
}

.execution-block-body {
  padding: 8px 12px;
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

.tool-status-result {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: stretch;
}

.tool-status-result-label {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.tool-result-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--td-brand-color-light, #e7f1ff);
  border: 1px solid var(--td-brand-color-focus, #b0c8f0);
  font-size: 12px;
  color: var(--td-brand-color, #0052d9);
  font-weight: 500;
  transition: all 0.15s;
}

.tool-result-header:hover {
  background: var(--td-brand-color-light-hover, #d6e6ff);
  border-color: var(--td-brand-color, #0052d9);
}

.tool-args-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--td-brand-color-light, #e7f1ff);
  border: 1px solid var(--td-brand-color-focus, #b0c8f0);
  font-size: 12px;
  color: var(--td-brand-color, #0052d9);
  font-weight: 500;
  transition: all 0.15s;
}

.tool-args-header:hover {
  background: var(--td-brand-color-light-hover, #d6e6ff);
  border-color: var(--td-brand-color, #0052d9);
}

.tool-child-args-label {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  margin-bottom: 4px;
}

.tool-result-arrow {
  font-size: 10px;
  color: inherit;
  width: 10px;
  display: inline-block;
  text-align: center;
}

.tool-status-result-body {
  margin: 0;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.35;
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
}

.tool-download-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tool-download-name {
  font-size: 12px;
  color: var(--td-text-color-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-download-size {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.tool-download-btn {
  flex-shrink: 0;
  padding: 4px 14px;
  font-size: 12px;
  color: #fff;
  background: var(--td-brand-color, #0052d9);
  border-radius: 4px;
  text-decoration: none;
  transition: opacity 0.15s;
}

.tool-download-btn:hover {
  opacity: 0.85;
}

.tool-child-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  width: 100%;
}

.tool-child-result {
  margin-left: 0;
  width: 100%;
  max-width: 520px;
}

/* ── Think block 样式 ── */

/* Standalone think blocks (kept for backward compat) */
.think-blocks-standalone {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
}

/* Inline think block — interspersed in text flow */
.think-block--inline {
  margin: 10px 0;
}

.tool-think-blocks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 14px;
  padding-left: 10px;
  border-left: 2px solid var(--td-component-stroke);
  width: 100%;
}

.think-block {
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
  background: var(--td-bg-color-secondarycontainer);
  margin: 4px 0;
  display: block;
  width: fit-content;
  min-width: 260px;
  max-width: 100%;
}

.think-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  user-select: none;
  background: var(--td-bg-color-secondarycontainer);
}

.think-block-header:hover {
  background: var(--td-bg-color-container-hover);
}

.think-block-arrow {
  font-size: 10px;
  flex-shrink: 0;
  opacity: 0.6;
}

.think-block-label {
  font-weight: 400;
  color: var(--td-text-color-secondary);
  flex: 1;
}

.think-block-status {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.think-block-status--running {
  color: var(--td-brand-color);
}

.think-block-status--failed {
  color: var(--td-error-color);
}

.think-block-body {
  padding: 4px 12px;
  max-height: 320px;
  overflow-y: auto;
}

.think-block-body :deep(*) {
  font-size: 11px !important;
  color: var(--td-text-color-placeholder) !important;
  line-height: 1.5 !important;
}

.think-block-empty {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  padding: 8px 0;
}

/* inline think block inherits base styles */

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
  cursor: pointer;
  user-select: none;
}

.tool-child-item:hover {
  opacity: 0.85;
}

.tool-child-arrow {
  font-size: 10px;
  flex-shrink: 0;
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

.tool-polling-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.tool-polling-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.tool-polling-arrow {
  font-size: 10px;
  color: var(--td-text-color-placeholder);
  width: 12px;
  flex-shrink: 0;
}

/* 把 TChat 内置的"回到底部"按钮挪到聊天框右侧底部（消息操作图标行右边） */
:deep(.t-chat__to-bottom) {
  left: auto !important;
  right: 12px !important;
  margin-left: 0 !important;
  top: auto !important;
  bottom: 20px !important;
}

.tool-polling-elapsed {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.tool-polling-count {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.tool-polling-responses {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.tool-polling-resp-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tool-polling-resp-time {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  flex-shrink: 0;
  padding-top: 6px;
  min-width: 56px;
}

.tool-polling-resp-body {
  margin: 0;
  flex: 1;
  padding: 6px 8px;
  background: var(--td-bg-color-container);
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
}

.llm-log-actions--inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 6px;
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

.from-notification-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin: 0 12px 8px 12px;
  background: linear-gradient(90deg, var(--td-brand-color-light), transparent);
  border-left: 3px solid var(--td-brand-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--td-text-color-primary);
}

.banner-icon {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  border-radius: 4px;
  letter-spacing: 0.04em;
}

.banner-task-id {
  margin-left: 4px;
  color: var(--td-text-color-placeholder);
  font-family: var(--td-font-family-mono);
  font-size: 12px;
}

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 槽位：横向比头像略宽以留白；纵向与昵称顶对齐（TChat 已在 .t-chat__avatar 上设 padding-top 与 content--base 一致，勿再垂直居中把头像顶下去） */
.chat-avatar-slot {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  min-width: 40px;
  min-height: 24px;
  box-sizing: border-box;
}

:deep(.t-chat) {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  height: 100% !important;
}

:deep(.t-chat__list) {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

:deep(.t-chat__inner) {
  display: flex !important;
  align-items: flex-start;
}

/* TChat 在 avatar 外包一层 __avatar / __avatar__box；原先写死 24×24 会压扁槽位，导致留白无效 */
:deep(.t-chat__avatar) {
  overflow: visible !important;
  flex-shrink: 0;
  align-self: flex-start;
}

:deep(.t-chat__avatar__box) {
  overflow: visible !important;
  border-radius: 8px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  width: 40px !important;
  height: auto !important;
  min-width: 40px;
  min-height: 24px;
  padding: 0 !important;
  display: flex !important;
  align-items: flex-start;
  justify-content: center;
}

:deep(.t-chat__content) {
  border-radius: var(--td-radius-large);
  box-sizing: border-box;
  min-width: 0;
}

/* 昵称与时间不要紧贴气泡正文 */
:deep(.t-chat__base) {
  margin-bottom: 6px;
}

:deep(.t-chat__list) {
  padding-right: 8px;
  padding-bottom: 12px;
}

:deep(.t-chat__item) {
  margin-bottom: 20px;
}

:deep(.t-chat__content-markdown pre) {
  border-radius: var(--td-radius-medium);
}

@keyframes thinkingBob {
  0%,
  100% {
    transform: translateY(0) rotate(0deg) scale(1);
  }
  25% {
    transform: translateY(-3px) rotate(-6deg) scale(1.02);
  }
  50% {
    transform: translateY(-5px) rotate(-10deg) scale(1.04);
  }
  75% {
    transform: translateY(-3px) rotate(-4deg) scale(1.02);
  }
}

@keyframes thinkingPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(0, 82, 217, 0.06);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 6px 24px 2px rgba(0, 82, 217, 0.12);
    transform: scale(1.01);
  }
}

@keyframes thinkingWave {
  0% {
    transform: translateX(-100%);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateX(280%);
    opacity: 0;
  }
}

/* 打字机效果 - 闪烁光标 */
.typewriter-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background-color: var(--td-brand-color);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: typewriterCursor 0.8s ease-in-out infinite;
}

@keyframes typewriterCursor {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* 流式内容容器 */
.streaming-content {
  position: relative;
}

/* 打字机效果 - 淡入动画 */
.typewriter-content {
  animation: typewriterFadeIn 0.15s ease-out forwards;
}

@keyframes typewriterFadeIn {
  from {
    opacity: 0.7;
  }
  to {
    opacity: 1;
  }
}

/* 流式加载中的内容包装器 */
.content-wrapper {
  position: relative;
  display: inline;
}

.confirmation-card {
  margin-top: 8px;
  border: 1px solid var(--td-border-level-2-color);
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-container);
  overflow: hidden;
  max-width: 420px;
}

.confirmation-card--confirmed {
  border-color: var(--td-success-color-3);
}

.confirmation-card--cancelled,
.confirmation-card--expired {
  opacity: 0.7;
}

.confirmation-header {
  padding: 8px 12px;
  background-color: var(--td-warning-color-1);
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.confirmation-card--confirmed .confirmation-header {
  background-color: var(--td-success-color-1);
}

.confirmation-card--cancelled .confirmation-header,
.confirmation-card--expired .confirmation-header {
  background-color: var(--td-bg-color-secondarycontainer);
}

.confirmation-title {
  font-weight: 600;
  color: var(--td-warning-color-6);
  font-size: 14px;
}

.confirmation-card--confirmed .confirmation-title {
  color: var(--td-success-color-6);
}

.confirmation-card--done .confirmation-title {
  color: var(--td-success-color-6);
}

.confirmation-card--error .confirmation-title {
  color: var(--td-error-color-6);
}

.confirmation-card--cancelled .confirmation-title,
.confirmation-card--expired .confirmation-title {
  color: var(--td-text-color-secondary);
}

.confirmation-body {
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.confirmation-body p {
  margin: 0 0 6px 0;
}

.confirmation-body p:last-child {
  margin-bottom: 0;
}

.confirmation-params {
  margin-top: 8px;
}

.confirmation-params-label {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--td-text-color-primary);
}

.confirmation-params-pre {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 6px;
  border: 1px solid var(--td-border-level-1-color);
  max-height: 220px;
  overflow: auto;
}

.confirmation-inline-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.confirmation-inline-field label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.confirmation-actions {
  padding: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.confirmation-status-badge {
  padding: 8px 12px;
  border-top: 1px solid var(--td-border-level-1-color);
  text-align: center;
}

.confirmation-badge {
  font-size: 12px;
  font-weight: 600;
}

.confirmation-badge--confirmed {
  color: var(--td-success-color);
}

.confirmation-badge--done {
  color: var(--td-success-color);
}

.confirmation-badge--failed {
  color: var(--td-error-color);
}

.confirmation-badge--cancelled {
  color: var(--td-text-color-placeholder);
}

.confirmation-badge--expired {
  color: var(--td-text-color-placeholder);
}

/* 自定义操作栏，与 TDesign t-chat__actions 样式一致 */
.chat-actions-bar {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  margin-top: var(--td-comp-margin-xs);
  background-color: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-border-level-2-color);
  gap: 0;
}
.chat-actions-bar .t-button {
  padding: var(--td-comp-paddingTB-xs) var(--td-comp-paddingLR-xs);
  width: var(--td-comp-size-xxxs);
  height: var(--td-comp-size-xxxs);
  box-sizing: content-box;
  color: var(--td-text-color-primary);
  background-color: transparent;
  border: 0;
  margin-right: var(--td-comp-margin-xs);
}
.chat-actions-bar .t-button .t-icon {
  font-size: var(--td-font-size-body-large);
}
.chat-actions-bar .t-button:hover {
  background-color: var(--td-bg-color-secondarycontainer-hover);
}
.chat-actions-divider {
  width: 1px;
  height: var(--td-comp-size-xxxs);
  background-color: var(--td-component-stroke);
  margin-right: var(--td-comp-margin-xs);
}
</style>
