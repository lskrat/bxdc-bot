<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { ChatSender as TChatSender } from '@tdesign-vue-next/chat'
import { DialogPlugin, MessagePlugin, Switch as TSwitch } from 'tdesign-vue-next'
import { DeleteIcon } from 'tdesign-icons-vue-next'
import { useChat } from '../composables/useChat'
import { useUser } from '../composables/useUser'
import { useConversations } from '../composables/useConversations'
import { useFileUpload } from '../composables/useFileUpload'
import { useMemory } from '../composables/useMemory'
import { fileService } from '../services/fileService'
import { apiUrl } from '../services/config'
import { FILE_INPUT_ACCEPT, FILE_TYPE_ICONS, FILE_TYPE_LABELS } from '../types/fileUpload'
import type { FileType, UploadFileInfo } from '../types/fileUpload'

const { sendMessage, isThinking, stop } = useChat()
const { currentUser } = useUser()
const { currentConversationId } = useConversations()
const fileUpload = useFileUpload()
const memoryApi = useMemory()

/** localStorage key prefix，按 userId 隔离记忆开关偏好 */
const MEMORY_LS_PREFIX = 'memoryEnabled:'
const readStoredMemory = (uid?: string) => {
  if (!uid) return null
  const raw = localStorage.getItem(MEMORY_LS_PREFIX + uid)
  if (raw === 'false') return false
  if (raw === 'true') return true
  return null
}
const writeStoredMemory = (uid: string, val: boolean) => {
  localStorage.setItem(MEMORY_LS_PREFIX + uid, String(val))
}

/** 记忆开关：默认 true，用 localStorage 覆盖默认值避免刷新闪烁 */
const memoryEnabled = ref(readStoredMemory(currentUser.value?.id) ?? true)
/** 全局记忆开关（MEM0_ENABLED）；false 时本页开关被强制为 off */
const memoryGloballyEnabled = ref(true)
/** 用户是否已手动操作过；true 后不再用 backend status 覆盖 */
let _userToggledMemory = false
/** status 接口是否已回来，避免请求未归时用户手改被覆盖 */
let _memoryStatusLoaded = false

/** 从 backend /memory/status 同步 MEM0_ENABLED 状态 */
async function syncMemoryStatusFromBackend() {
  if (_userToggledMemory || _memoryStatusLoaded) return
  const uid = currentUser.value?.id
  if (!uid) return
  try {
    const status = await memoryApi.getMemoryStatus(uid)
    if (_userToggledMemory || _memoryStatusLoaded) return
    _memoryStatusLoaded = true
    memoryGloballyEnabled.value = status.enabled !== false
    if (!memoryGloballyEnabled.value) {
      memoryEnabled.value = false
      writeStoredMemory(uid, false)
    }
  } catch {
    console.warn('[MessageInput] getMemoryStatus failed, keep default')
    _memoryStatusLoaded = true
  }
}

/** 用户手动切换开关：标记 + 持久化 */
function onMemoryToggleChange() {
  _userToggledMemory = true
  _memoryStatusLoaded = true
  const uid = currentUser.value?.id
  if (uid) writeStoredMemory(uid, memoryEnabled.value)
}

/** 全局禁用时强制置 off，并持久化 */
watch([memoryEnabled, memoryGloballyEnabled], ([memVal, globalVal]) => {
  if (!globalVal && memVal === true) {
    memoryEnabled.value = false
    const uid = currentUser.value?.id
    if (uid) writeStoredMemory(uid, false)
  }
})

onMounted(() => { syncMemoryStatusFromBackend() })

/** 切换用户时重置状态，读新用户的 localStorage 偏好 */
watch(currentUser, () => {
  _userToggledMemory = false
  _memoryStatusLoaded = false
  memoryGloballyEnabled.value = true
  memoryEnabled.value = readStoredMemory(currentUser.value?.id) ?? true
  syncMemoryStatusFromBackend()
})

// 会话切换时：同步 conversationId + 清空文件（每个会话独立选择，首次挂载不清空）
let _watchSessionInitial = true
watch(currentConversationId, (cid) => {
  fileUpload.setConversationId(cid ?? null)
  if (!_watchSessionInitial) {
    fileUpload.clearFiles()
  }
  _watchSessionInitial = false
}, { immediate: true })
const input = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 等待解析时的 loading 状态（spinner） */
const isWaitingForParse = ref(false)

// ========== 引用文件（从 enabled_files 中选择） ==========

interface EnabledFileItem {
  id: number
  fileName: string
  fileType: string
  fileSize: number
}

/** 「+」按钮菜单可见状态 */
const showAttachMenu = ref(false)
/** 引用文件弹窗可见 */
const showRefFilePopup = ref(false)
/** 当前会话的 enabled_files 文件列表 */
const refFileList = ref<EnabledFileItem[]>([])
/** 正在加载文件列表 */
const isLoadingRefFiles = ref(false)
/** 加载/获取文件列表时的错误信息 */
const refFileError = ref<string | null>(null)

/** 点击外部关闭「+」菜单 */
function onDocumentClickForAttachMenu(e: MouseEvent) {
  if (!showAttachMenu.value) return
  const target = e.target as HTMLElement | null
  if (target && target.closest('.attach-menu-container')) return
  showAttachMenu.value = false
}
onMounted(() => document.addEventListener('click', onDocumentClickForAttachMenu))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClickForAttachMenu))

/** 「+」菜单 → 上传新文件 */
function onAttachMenuUpload() {
  showAttachMenu.value = false
  triggerFilePicker()
}

/** 「+」菜单 → 引用已启用文件 */
function onAttachMenuRefFile() {
  showAttachMenu.value = false
  openRefFilePicker()
}

/** 打开引用文件弹窗：获取当前会话的 enabled_files 列表 */
async function openRefFilePicker() {
  const cid = currentConversationId.value
  if (!cid) {
    MessagePlugin.warning('请先选择一个会话')
    return
  }
  showRefFilePopup.value = true
  isLoadingRefFiles.value = true
  refFileError.value = null
  try {
    // 1. 获取会话的 enabled_files
    const headers: Record<string, string> = {}
    if (currentUser.value?.id) headers['X-User-Id'] = String(currentUser.value.id)
    const convRes = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(cid)}`), { headers })
    if (!convRes.ok) throw new Error('无法获取会话信息')
    const convData = await convRes.json()
    const raw: string | null = convData?.conversation?.enabled_files ?? null
    const enabledIds: number[] = raw && raw !== 'null' ? JSON.parse(raw) : []

    if (enabledIds.length === 0) {
      refFileList.value = []
      return
    }

    // 2. 获取全量文件列表，按 enabled_ids 过滤
    const allFiles = await fileService.listFiles()
    const idSet = new Set(enabledIds)
    refFileList.value = allFiles
      .filter(f => idSet.has(f.id))
      .map(f => ({ id: f.id, fileName: f.originalFileName || f.fileName, fileType: f.fileType, fileSize: f.fileSize }))
  } catch (e: any) {
    refFileError.value = e.message || '加载文件列表失败'
    refFileList.value = []
  } finally {
    isLoadingRefFiles.value = false
  }
}

/** 弹窗内暂存的多选文件 ID */
const pendingRefIds = ref<Set<number>>(new Set())

/** 弹窗内点击文件：切换选中状态 */
function toggleRefFileSelection(file: EnabledFileItem) {
  const s = new Set(pendingRefIds.value)
  if (s.has(file.id)) {
    s.delete(file.id)
  } else {
    s.add(file.id)
  }
  pendingRefIds.value = s
}

/** 确认引用选中文件：将每个文件注入 uploadedFiles.txt，让现有文件列表 UI 统一展示 */
async function confirmRefFileSelections() {
  if (pendingRefIds.value.size === 0) return
  // 安全兜底：排除已通过「引用」加入的重复文件
  const ids = Array.from(pendingRefIds.value).filter(id => !refFileIdsAlreadyAdded.value.has(id))
  if (ids.length === 0) {
    pendingRefIds.value = new Set()
    showRefFilePopup.value = false
    return
  }
  const now = Date.now()

  for (const id of ids) {
    const file = refFileList.value.find(f => f.id === id)
    if (!file) continue

    let parsedText = `[文件: ${file.fileName}] (暂无解析摘要)`
    try {
      const detail = await fileService.getFileDetail(id)
      if (detail.parsedSummary) {
        parsedText = formatParsedSummaryForLlm(file.fileName, detail.parsedSummary)
      }
    } catch (e: any) {
      parsedText = `[文件: ${file.fileName}] (获取摘要失败: ${e.message})`
    }

    const info: UploadFileInfo = {
      id: `ref-${file.id}-${now}`,
      file: new File([], file.fileName),
      fileName: file.fileName,
      fileType: 'txt' as FileType,
      size: file.fileSize,
      status: 'parsed' as const,
      parsedText,
      uploadedAt: now,
    }
    fileUpload.uploadedFiles.value.txt.push(info)
  }

  pendingRefIds.value = new Set()
  showRefFilePopup.value = false
}

/** 将 parsedSummary JSON 字符串转换为 LLM 可读的纯文本 */
function formatParsedSummaryForLlm(fileName: string, raw: string): string {
  let summary: Record<string, unknown>
  try {
    summary = JSON.parse(raw)
  } catch {
    return `[文件: ${fileName}]\n${raw.substring(0, 800)}`
  }

  const lines: string[] = [`[引用的文件: ${fileName}]`]
  const ft = String(summary.fileType || '')
  let typeLabel = ft
  if (ft === 'docx' || ft === 'word') typeLabel = 'Word 文档'
  else if (ft === 'xlsx' || ft === 'excel') typeLabel = 'Excel 表格'
  else if (ft === 'csv') typeLabel = 'CSV 文件'
  else if (ft === 'txt' || ft === 'md' || ft === 'py') typeLabel = '文本文件'
  lines.push(`类型: ${typeLabel}`)

  // Word 类文件
  if (summary.pageEstimate != null) lines.push(`预估页数: ${summary.pageEstimate}`)
  if (summary.paragraphCount != null) lines.push(`段落数: ${summary.paragraphCount}`)
  if (summary.tableCount != null) lines.push(`表格数: ${summary.tableCount}`)
  if (summary.imageCount != null) lines.push(`图片数: ${summary.imageCount}`)

  // 大纲
  const outline = summary.outline as Array<{ level?: number; text?: string; children?: unknown[] }> | undefined
  if (outline && outline.length > 0) {
    lines.push('大纲:')
    for (const item of outline.slice(0, 15)) {
      const indent = '  '.repeat(Math.max(0, (item.level || 1) - 1))
      lines.push(`${indent}- ${item.text || '(无标题)'}`)
    }
    if (outline.length > 15) lines.push(`  ... 共 ${outline.length} 项`)
  }

  // Excel 类文件
  if (summary.sheetCount != null) lines.push(`Sheet 数量: ${summary.sheetCount}`)
  const sheets = summary.sheets as Array<{ name?: string; rowCount?: number; colCount?: number; headerText?: string[] }> | undefined
  if (sheets && sheets.length > 0) {
    lines.push('Sheet 列表:')
    for (const s of sheets) {
      const header = s.headerText?.length ? `, 标题: ${s.headerText.join(', ')}` : ''
      lines.push(`  - ${s.name || '(未命名)'} (${s.rowCount ?? '?'} 行 × ${s.colCount ?? '?'} 列${header})`)
    }
  }

  // 文本类文件
  if (summary.lineCount != null) lines.push(`总行数: ${summary.lineCount}`)

  // 表格信息（Word 中的表格）
  const tables = summary.tables as Array<{ tableIndex?: number; rowCount?: number; colCount?: number; headerText?: string[]; locationDescription?: string }> | undefined
  if (tables && tables.length > 0) {
    lines.push(`表格详情:`)
    for (const t of tables.slice(0, 5)) {
      const header = t.headerText?.length ? ` 标题: ${t.headerText.join(' | ')}` : ''
      const loc = t.locationDescription ? ` 位置: ${t.locationDescription}` : ''
      lines.push(`  表${t.tableIndex ?? ''}: ${t.rowCount ?? '?'}行×${t.colCount ?? '?'}列${header}${loc}`)
    }
  }

  // 内容预览（TXT/MD 等）
  const preview = summary.contentPreview as string | undefined
  if (preview) {
    const truncated = preview.length > 600 ? preview.substring(0, 600) + '...' : preview
    lines.push(`\n[内容预览]\n${truncated}`)
  }

  // 全量内容（仅当无 preview 且有 fullContent 时）
  const full = summary.fullContent as string | undefined
  if (!preview && full) {
    const truncated = full.length > 1000 ? full.substring(0, 1000) + '...' : full
    lines.push(`\n[文件内容]\n${truncated}`)
  }

  return lines.join('\n')
}

/** 扁平化所有已上传文件（按当前会话隔离：只展示属于当前会话或无会话标记的文件） */
const allFiles = computed<UploadFileInfo[]>(() => {
  const groups = fileUpload.uploadedFiles.value
  const cid = currentConversationId.value
  const all = [
    ...groups.word,
    ...groups.excel,
    ...groups.ppt,
    ...groups.txt,
    ...groups.image,
  ]
  if (!cid) return all
  return all.filter(f => !f.conversationId || f.conversationId === cid)
})

/** 已通过「引用」或「上传」加入的文件 ID 集合，用于 ref 弹窗禁用已选/已传文件 */
const refFileIdsAlreadyAdded = computed(() => {
  const ids = new Set<number>()
  const names = new Set<string>()
  for (const f of allFiles.value) {
    const match = f.id.match(/^ref-(\d+)-/)
    if (match) {
      ids.add(Number(match[1]))
    }
    names.add(f.fileName)
  }
  // 文件名交叉去重：已上传的文件名若出现在 ref 列表中也禁用
  for (const f of refFileList.value) {
    if (names.has(f.fileName)) {
      ids.add(f.id)
    }
  }
  return ids
})

/** 文档分组（word/excel/ppt/txt） */
const documentFiles = computed(() => {
  const g = fileUpload.uploadedFiles.value
  return [...g.word, ...g.excel, ...g.ppt, ...g.txt]
})

/** 图片分组 */
const imageFiles = computed(() => fileUpload.uploadedFiles.value.image)

/** 是否显示文件列表 */
const showFileList = computed(() => allFiles.value.length > 0)

/** 触发文件选择器 */
function triggerFilePicker() {
  fileInputRef.value?.click()
}

/** 文件选择回调 */
async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const files = Array.from(target.files)
  const added = await fileUpload.addFiles(files)

  // 统一走批量解析（MAX_CONCURRENT_PARSES=3），避免无界并发
  if (added.length > 0) {
    await fileUpload.parseFiles(added)
  }

  // 重置 input 以便下次能选同名文件
  target.value = ''
}

/** 拖拽上传：调用 composable 的 onDrop，自动 addFiles + 解析 */
async function onDrop(e: DragEvent) {
  // 无论 drop 成功 / 被拒（被 addFiles 类型校验拦截），都要清掉 drop zone 高亮
  isDragOver.value = false
  dragCounter.value = 0
  await fileUpload.onDrop(e)
}

/** 粘贴上传（Ctrl+V）：调用 composable 的 onPaste */
async function onPaste(e: ClipboardEvent) {
  await fileUpload.onPaste(e)
}

/**
 * open spec: drop-zone-stuck — 拖拽视觉反馈用 counter 模式而非 relatedTarget 检测
 *
 * Bug 复现：拖文件进入 chat 区域 → 松手 → 蓝色虚线框（drop zone 高亮）一直不消失
 *
 * 根因：
 *   1) 原 onDragLeave 用 e.relatedTarget 判断"是否真的离开"，但 drag 事件的 relatedTarget
 *      在 Chrome/Edge 浏览器中**始终为 null**（标准里 drag events 的 relatedTarget
 *      定义就比较模糊），导致 isDragOver 永远为 true
 *   2) 原 onDrop 没显式重置 isDragOver，依赖 dragleave 触发清空 → bug #1 链式失败
 *
 * 修复：dragenter/dragleave counter 模式（counter > 0 表示"在区域内"，counter <= 0 表示"完全离开"）
 *   + onDrop 显式重置（drop 成功后必然触发）
 *   + dragend 在 document 监听（用户 ESC 取消拖拽时拖回原处时触发，兜底重置）
 */
const isDragOver = ref(false)
const dragCounter = ref(0)
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter.value += 1
  isDragOver.value = true
}
function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter.value -= 1
  if (dragCounter.value <= 0) {
    dragCounter.value = 0
    isDragOver.value = false
  }
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
}

/** 兜底：拖拽被 ESC 取消时，dragend 在 source element 触发，document 监听即可 */
function onDocumentDragEnd() {
  dragCounter.value = 0
  isDragOver.value = false
}
onMounted(() => document.addEventListener('dragend', onDocumentDragEnd))
onBeforeUnmount(() => document.removeEventListener('dragend', onDocumentDragEnd))

/** 移除文件（点击 × 取消按钮） */
function onRemoveFile(id: string) {
  // 解析中或解析前都走 cancel（cancel 会 abort + 移除）
  fileUpload.cancel(id)
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

/** 获取文件类型展示名 */
function getFileLabel(type: FileType, fileName?: string): string {
  // .txt / .md / .py 共用 fileType='txt'，但要按扩展名区分 label
  if (type === 'txt' && fileName) {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
    if (ext === '.md') return 'Markdown'
    if (ext === '.py') return 'Python'
    if (ext === '.txt') return 'TXT 文本'
  }
  return FILE_TYPE_LABELS[type]
}

/** 获取文件图标（支持非 FileType 字符串，兜底 📄） */
function getFileIcon(type: string): string {
  return (FILE_TYPE_ICONS as Record<string, string>)[type] || '📄'
}

/** 把所有处于 parsing 状态的文件标记为 skipped */
function skipParsingFiles() {
  for (const f of allFiles.value) {
    if (f.status === 'parsing') {
      fileUpload.setFileStatus(f.id, 'skipped')
    }
  }
}

/** 实际执行 sendMessage（统一入口，处理 parsing 决策后调用） */
async function doSendMessage(text: string) {
  input.value = ''

  const files = allFiles.value
  if (files.length > 0) {
    await sendMessage(text, currentUser.value?.id, files, memoryEnabled.value)
  } else {
    await sendMessage(text, currentUser.value?.id, undefined, memoryEnabled.value)
  }
}

/** TChatSender 加载中显示的停止按钮：中断当前 SSE 流 + 重置 isThinking。 */
function onStop() {
  stop()
}

async function handleSend(value: string) {
  // @ts-ignore
  const text = (typeof value === 'string' ? value : value?.text || '').trim()
  if (!text || isThinking.value) return

  const files = allFiles.value
  const hasParsing = files.some((f) => f.status === 'parsing')

  // 无文件 或 无 parsing 文件 → 直接发送
  if (files.length === 0 || !hasParsing) {
    await doSendMessage(text)
    return
  }

  // 有 parsing 文件 → 弹 t-dialog 三选一
  const parsingCount = files.filter((f) => f.status === 'parsing').length
  const result = await new Promise<'wait' | 'now' | 'cancel'>((resolve) => {
    const dlg = DialogPlugin({
      header: '文件正在解析',
      body: `${parsingCount} 个文件正在解析，是否等待解析完成后发送？`,
      footer: false, // 使用自定义 footer
      onClose: () => resolve('cancel'),
    })
    // TDesign Dialog 渲染后通过 DOM 注入 3 个按钮
    nextTick(() => {
      const root = document.querySelector(`.t-dialog__ctx [role="dialog"]`) as HTMLElement | null
      if (!root) {
        resolve('cancel')
        dlg.destroy?.()
        return
      }
      const footer = document.createElement('div')
      footer.className = 'parsing-confirm-footer'
      footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:16px 0 0;'
      const makeBtn = (label: string, theme: 'primary' | 'default' | 'danger', value: 'wait' | 'now' | 'cancel') => {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.className = `t-button t-button--theme-${theme} t-button--variant-base`
        btn.style.cssText = 'padding:6px 16px;border-radius:6px;border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);cursor:pointer;'
        if (theme === 'primary') {
          btn.style.background = 'var(--td-brand-color)'
          btn.style.color = 'var(--td-text-color-anti)'
          btn.style.borderColor = 'var(--td-brand-color)'
        }
        btn.onclick = () => { resolve(value); dlg.destroy?.() }
        return btn
      }
      footer.appendChild(makeBtn('取消', 'default', 'cancel'))
      footer.appendChild(makeBtn('立即发送', 'default', 'now'))
      footer.appendChild(makeBtn('等待解析', 'primary', 'wait'))
      // 找到 dialog body 容器
      const body = root.querySelector('.t-dialog__body') || root.querySelector('.t-dialog__main') || root
      body.appendChild(footer)
    })
  })

  if (result === 'cancel') return

  if (result === 'now') {
    skipParsingFiles()
    await doSendMessage(text)
    return
  }

  // 'wait'：等待解析（最多 5s）
  isWaitingForParse.value = true
  try {
    const { pending } = await fileUpload.waitForAllParsing({ timeoutMs: 5000 })
    if (pending.length > 0) {
      // 超时未完成 → 标记 skipped + 提示
      for (const f of pending) {
        fileUpload.setFileStatus(f.id, 'skipped')
      }
      MessagePlugin.warning(`${pending.length} 个文件解析超时，已跳过`)
    }
  } finally {
    isWaitingForParse.value = false
  }
  await doSendMessage(text)
}
</script>

<template>
  <div
    class="input-container"
    :class="{ 'input-container--drag-over': isDragOver }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @paste="onPaste"
  >
    <!-- 隐藏的文件 input -->
    <input
      ref="fileInputRef"
      type="file"
      :accept="FILE_INPUT_ACCEPT"
      multiple
      style="display: none"
      @change="onFileChange"
    />

    <!-- 已选文件列表（仅在有文件时显示） -->
    <div v-if="showFileList" class="file-list">
      <!-- 文档分组 -->
      <div v-if="documentFiles.length > 0" class="file-list-group">
        <div class="file-list-group-title">文档 ({{ documentFiles.length }})</div>
        <div class="file-list-items">
          <div
            v-for="f in documentFiles"
            :key="f.id"
            class="file-list-item"
            :class="{ 'file-list-item--skipped': f.status === 'skipped' }"
          >
            <span class="file-icon">{{ FILE_TYPE_ICONS[f.fileType] }}</span>
            <div class="file-info">
              <div class="file-name" :title="f.fileName">{{ f.fileName }}</div>
              <div class="file-meta">
                <span>{{ getFileLabel(f.fileType, f.fileName) }}</span>
                <span class="dot">·</span>
                <span>{{ formatSize(f.size) }}</span>
                <span v-if="f.status === 'parsing'" class="status status-parsing">解析中...</span>
                <span v-else-if="f.status === 'parsed'" class="status status-parsed">✓</span>
                <span
                  v-else-if="f.status === 'failed'"
                  class="status status-failed"
                  :title="f.errorMessage || '该文件未能解析，不参与本次对话'"
                >失败</span>
                <span v-else-if="f.status === 'skipped'" class="status status-skipped">已跳过</span>
                <span
                  v-if="f.truncated"
                  class="badge badge-truncated"
                  title="解析内容超过长度限制，已自动截断"
                >内容已截断</span>
              </div>
            </div>
            <t-button
              size="small"
              variant="text"
              theme="default"
              class="file-remove"
              @click="onRemoveFile(f.id)"
            >
              <template #icon><DeleteIcon /></template>
            </t-button>
          </div>
        </div>
      </div>

      <!-- 图片分组 -->
      <div v-if="imageFiles.length > 0" class="file-list-group">
        <div class="file-list-group-title">图片 ({{ imageFiles.length }})</div>
        <div class="file-list-items file-list-images">
          <div
            v-for="f in imageFiles"
            :key="f.id"
            class="file-list-item file-list-image-item"
            :class="{ 'file-list-item--skipped': f.status === 'skipped' }"
          >
            <div class="image-thumb">
              <img v-if="f.previewUrl" :src="f.previewUrl" :alt="f.fileName" />
              <span v-else class="file-icon">{{ FILE_TYPE_ICONS.image }}</span>
            </div>
            <div class="file-info">
              <div class="file-name" :title="f.fileName">{{ f.fileName }}</div>
              <div class="file-meta">
                <span>{{ formatSize(f.size) }}</span>
                <span v-if="f.status === 'parsing'" class="status status-parsing">识别中...</span>
                <span v-else-if="f.status === 'parsed'" class="status status-parsed">✓</span>
                <span
                  v-else-if="f.status === 'failed'"
                  class="status status-failed"
                  :title="f.errorMessage || '该文件未能解析，不参与本次对话'"
                >失败</span>
                <span v-else-if="f.status === 'skipped'" class="status status-skipped">已跳过</span>
                <span
                  v-if="f.truncated"
                  class="badge badge-truncated"
                  title="解析内容超过长度限制，已自动截断"
                >内容已截断</span>
              </div>
            </div>
            <t-button
              size="small"
              variant="text"
              theme="default"
              class="file-remove"
              @click="onRemoveFile(f.id)"
            >
              <template #icon><DeleteIcon /></template>
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 记忆开关行 -->
    <div class="memory-toggle-row">
      <TSwitch
        v-model="memoryEnabled"
        size="small"
        :disabled="!memoryGloballyEnabled"
        @change="onMemoryToggleChange"
      />
      <span class="memory-toggle-label">启用记忆</span>
      <span v-if="!memoryGloballyEnabled" class="memory-toggle-hint memory-toggle-hint--disabled">
        后端记忆功能已被禁用（MEM0_ENABLED=false），开关不可开启
      </span>
      <span v-else class="memory-toggle-hint">
        关闭后本次对话不使用之前的记忆，且不写入新记忆
      </span>
    </div>

    <!-- 文本输入区 + 按钮组 -->
    <div class="chat-sender-row" data-ref="chat-input-area">
      <TChatSender
        v-model="input"
        class="chat-sender"
        :loading="isThinking || isWaitingForParse"
        :placeholder="isWaitingForParse ? '正在等待文件解析...' : '输入消息，Enter 发送，Shift + Enter 换行'"
        :textarea-props="{ autosize: { minRows: 1, maxRows: 6 } }"
        @send="handleSend"
        @stop="onStop"
      >
        <template #footer-prefix>
          <!-- 「+」按钮：合并"上传"与"引用"两个入口，与发送按钮同处 footer 一行 -->
          <div class="attach-menu-container">
            <button
              type="button"
              class="attach-btn"
              :class="{ 'is-open': showAttachMenu }"
              :disabled="isThinking || isWaitingForParse"
              :aria-expanded="showAttachMenu"
              aria-label="附件菜单"
              @click="showAttachMenu = !showAttachMenu"
            >
              <span class="attach-btn-icon">+</span>
            </button>

            <!-- 「+」菜单 -->
            <div v-if="showAttachMenu" class="attach-menu">
              <button class="attach-menu-item" @click="onAttachMenuUpload">
                <span class="attach-menu-item-icon">📎</span>
                <span class="attach-menu-item-label">上传新文件</span>
                <span class="attach-menu-item-hint">本会话解析后参与对话</span>
              </button>
              <button class="attach-menu-item" @click="onAttachMenuRefFile">
                <span class="attach-menu-item-icon">📂</span>
                <span class="attach-menu-item-label">引用已启用文件</span>
                <span class="attach-menu-item-hint">来自左侧会话配置中启用的文件</span>
              </button>
            </div>
          </div>
        </template>
      </TChatSender>

      <!-- 引用文件选择弹窗 -->
      <div v-if="showRefFilePopup" class="ref-file-popup-overlay" @click.self="showRefFilePopup = false">
        <div class="ref-file-popup">
          <div class="ref-file-popup-header">
            <span>选择要引用的文件</span>
            <t-button size="small" variant="text" theme="default" @click="showRefFilePopup = false">✕</t-button>
          </div>
          <div v-if="isLoadingRefFiles" class="ref-file-popup-state">
            <t-loading text="加载文件列表..." />
          </div>
          <div v-else-if="refFileError" class="ref-file-popup-state">
            <p class="ref-file-popup-error">{{ refFileError }}</p>
          </div>
          <div v-else-if="refFileList.length === 0" class="ref-file-popup-state">
            <p>当前会话没有已启用的文件</p>
            <p class="ref-file-popup-hint">请在「会话配置 → 文件」中勾选文件</p>
          </div>
          <div v-else class="ref-file-popup-list">
            <div
              v-for="file in refFileList"
              :key="file.id"
              class="ref-file-popup-item"
              :class="{
                'is-selected': pendingRefIds.has(file.id),
                'is-disabled': refFileIdsAlreadyAdded.has(file.id),
              }"
              @click="refFileIdsAlreadyAdded.has(file.id) ? undefined : toggleRefFileSelection(file)"
            >
              <span class="ref-file-popup-checkbox">
                <span v-if="pendingRefIds.has(file.id)" class="ref-file-popup-checkbox-check">✓</span>
              </span>
              <span class="ref-file-popup-item-icon">{{ getFileIcon(file.fileType) }}</span>
              <div class="ref-file-popup-item-info">
                <div class="ref-file-popup-item-name">{{ file.fileName }}</div>
                <div class="ref-file-popup-item-meta">
                  {{ file.fileType }} · {{ formatSize(file.fileSize) }}
                  <span v-if="refFileIdsAlreadyAdded.has(file.id)" class="ref-file-popup-item-already">已添加</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="refFileList.length > 0" class="ref-file-popup-footer">
            <t-button
              theme="primary"
              size="small"
              :disabled="pendingRefIds.size === 0"
              @click="confirmRefFileSelections"
            >
              确认引用 ({{ pendingRefIds.size }})
            </t-button>
          </div>
        </div>
      </div>
    </div>

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
  border: 2px dashed transparent;
  border-radius: 12px;
  padding: 4px;
  transition: border-color 0.15s, background-color 0.15s;
}

.input-container--drag-over {
  border-color: var(--td-brand-color);
  background-color: var(--td-brand-color-light, rgba(0, 96, 175, 0.05));
}

/* ---------- 文件列表 ---------- */
.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.file-list-group {
  width: 100%;
  background-color: var(--td-bg-color-secondarycontainer);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid var(--td-border-level-2-color);
}

.file-list-group-title {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.file-list-items {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

.file-list-images {
  gap: 8px;
}

.file-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background-color: var(--td-bg-color-container);
  transition: background-color 0.15s;
  max-width: 320px;
}

.file-list-item:hover {
  background-color: var(--td-bg-color-secondarycontainer-hover);
}

.file-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.image-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  background-color: var(--td-bg-color-secondarycontainer);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-info {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  color: var(--td-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.file-meta .dot {
  margin: 0 2px;
}

.status {
  margin-left: 4px;
  font-weight: 500;
}

.status-parsing {
  color: var(--td-brand-color);
}

.status-parsed {
  color: var(--td-success-color);
}

.status-failed {
  color: var(--td-error-color);
}

.status-skipped {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

.file-list-item--skipped {
  opacity: 0.55;
}

.file-list-item--skipped .file-name,
.file-list-item--skipped .file-meta {
  text-decoration: line-through;
}

.badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.4;
  border-radius: 3px;
  white-space: nowrap;
}

.badge-truncated {
  background-color: var(--td-warning-color-1, #fff3e0);
  color: var(--td-warning-color, #d97706);
  border: 1px solid var(--td-warning-color-3, #fcd9a4);
}

.file-remove {
  flex-shrink: 0;
  color: var(--td-text-color-secondary);
}

/* ---------- 输入行 ---------- */
.chat-sender-row {
  position: relative;
  width: 100%;
}

/* ---------- 左侧「+」按钮 + 菜单（位于 TChatSender 的 footer-prefix 插槽内，与发送按钮同行） ---------- */
.attach-menu-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.attach-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 50%;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.attach-btn:hover:not(:disabled) {
  background-color: var(--td-bg-color-container-hover);
  color: var(--td-text-color-primary);
}

.attach-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attach-btn.is-open {
  background-color: var(--td-brand-color-light, rgba(0, 96, 175, 0.08));
  color: var(--td-brand-color);
}

.attach-btn-icon {
  font-size: 22px;
  line-height: 1;
  font-weight: 300;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* 「+」菜单：从按钮上方弹出 */
.attach-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-border-level-1-color, #e7e7e7);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}

.attach-menu-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.12s;
}

.attach-menu-item:hover {
  background-color: var(--td-bg-color-container-hover);
}

.attach-menu-item-icon {
  grid-row: 1 / span 2;
  font-size: 20px;
  line-height: 1;
  text-align: center;
}

.attach-menu-item-label {
  grid-column: 2;
  grid-row: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.attach-menu-item-hint {
  grid-column: 2;
  grid-row: 2;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  margin-top: 1px;
}

/* ---------- 引用文件弹窗 ---------- */
.ref-file-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ref-file-popup {
  background: var(--td-bg-color-container);
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.ref-file-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.ref-file-popup-state {
  padding: 24px 16px;
  text-align: center;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}

.ref-file-popup-error {
  color: var(--td-error-color);
}

.ref-file-popup-hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  margin-top: 6px;
}

.ref-file-popup-list {
  overflow-y: auto;
  max-height: calc(60vh - 52px);
  padding: 4px 0;
}

.ref-file-popup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.ref-file-popup-item:hover {
  background-color: var(--td-bg-color-container-hover);
}

.ref-file-popup-item--fetching {
  pointer-events: none;
  opacity: 0.7;
}

.ref-file-popup-item-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.ref-file-popup-item-info {
  flex: 1;
  min-width: 0;
}

.ref-file-popup-item-name {
  font-size: 13px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-file-popup-item-meta {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  margin-top: 2px;
}

.ref-file-popup-item.is-selected {
  background-color: var(--td-brand-color-light, rgba(0, 96, 175, 0.06));
  box-shadow: inset 3px 0 0 var(--td-brand-color);
}

.ref-file-popup-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background-color: var(--td-bg-color-secondarycontainer);
}

.ref-file-popup-item.is-disabled:hover {
  background-color: var(--td-bg-color-secondarycontainer);
}

.ref-file-popup-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid var(--td-border-level-2-color, #dcdcdc);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s, background-color 0.15s;
}

.is-selected .ref-file-popup-checkbox {
  background-color: var(--td-brand-color);
  border-color: var(--td-brand-color);
}

.ref-file-popup-checkbox-check {
  font-size: 12px;
  line-height: 1;
  color: #fff;
  font-weight: 700;
}

.ref-file-popup-item-already {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.4;
  border-radius: 3px;
  background-color: var(--td-success-color-1, #e6f7e6);
  color: var(--td-success-color, #2ba471);
  white-space: nowrap;
}

.ref-file-popup-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--td-border-level-1-color);
  display: flex;
  justify-content: flex-end;
}

.upload-emoji {
  display: inline-block;
  font-size: 22px;
  line-height: 1;
  transform: scaleX(1.45);
}

.chat-sender {
  flex: 1;
  min-width: 0;
}

/* ---------- 记忆开关行 ---------- */
.memory-toggle-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.memory-toggle-label {
  font-weight: 500;
  color: var(--td-text-color-primary);
  user-select: none;
}

.memory-toggle-hint {
  color: var(--td-text-color-placeholder);
  font-size: 11px;
}

.memory-toggle-hint--disabled {
  color: var(--td-error-color);
}

/* ---------- 通用样式 ---------- */
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

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .file-list-item {
    max-width: 240px;
  }

  .file-name {
    font-size: 12px;
  }

  .file-meta {
    font-size: 10px;
  }

  .image-thumb {
    width: 40px;
    height: 40px;
  }
}
</style>
