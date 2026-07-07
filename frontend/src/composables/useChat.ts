import { ref, provide, inject, type InjectionKey } from 'vue'
import { confirmAction, getAgentStreamUrl } from '../services/api'
import { agentUrl } from '../services/config'
import { useFileUpload } from './useFileUpload'
import { useConversations } from './useConversations'
import { type LlmLogEntry, isLlmLogEvent, mergeLlmLogEntries } from '../utils/llmLog'
import {
  extractArgumentsFromToolCallPayload,
  extractArgumentsFromToolResultMessage,
  mergeToolArgumentsField,
} from '../utils/toolInvocationUtils'
import { useThinkingMode } from './useThinkingMode'
import type { UploadFileInfo } from '../types/fileUpload'

export type ToolInvocationStatus = 'running' | 'completed' | 'failed'

export interface PollResponseEntry {
  time: string
  body: string
}

export interface PollingStatus {
  status: string
  retryCount: number
  elapsedSeconds: number
  pollResponses: PollResponseEntry[]
}

export interface ToolInvocation {
  id: string
  name: string
  displayName: string
  kind: 'skill' | 'tool'
  status: ToolInvocationStatus
  parentId?: string
  parentName?: string
  summary?: string
  arguments?: unknown
  /** Tool function return body (from SSE tool_status), sanitized on server */
  result?: string
  executionMode?: string
  executionLabel?: string
  children?: ToolInvocation[]
  /** Realtime polling progress (from SSE polling_status events) */
  pollingStatus?: PollingStatus
}

/** Sub-agent think block — collapsible section showing sub-agent execution output. */
export interface ThinkBlock {
  id: string
  parentToolId: string
  parentToolName?: string
  /** 子 Agent 执行文本内容（markdown） */
  content: string
  /** 首行摘要，显示在折叠标题栏"思考"后面 */
  summary: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt?: number
}

/** 正文段落：文字 或 think 块，按顺序穿插渲染 */
export type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'think'; thinkId: string }

export type { LlmLogEntry } from '../utils/llmLog'

export type LogTimelineEntry =
  | { kind: 'tool'; id: string }
  | { kind: 'llm'; id: string }

export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired'

/** After user confirms: running → completed/failed when matching tool_status arrives. */
export type ConfirmationExecutionOutcome = 'running' | 'completed' | 'failed'

export interface ConfirmationRequest {
  sessionId: string
  toolCallId: string
  toolName: string
  skillName: string
  summary: string
  details: string
  arguments?: unknown
  status: ConfirmationStatus
  /** Set when status is `confirmed`; updated when the tool finishes (SSE). */
  executionOutcome?: ConfirmationExecutionOutcome
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sessionId?: string
  toolInvocations?: ToolInvocation[]
  llmLogs?: LlmLogEntry[]
  /** 调用日志弹窗：按 SSE 到达顺序交错 Tool 与 LLM（仅本轮 assistant） */
  logTimeline?: LogTimelineEntry[]
  /** Pending skill confirmation cards attached to this message */
  confirmations?: ConfirmationRequest[]
  /**
   * 消息来源（async-task-result-echo-to-chat change）。
   * 未设置或 'web'/'api' 走普通渲染；'ASYNC_TASK_RESULT' 走专用 UI。
   */
  source?: 'web' | 'api' | 'ASYNC_TASK_RESULT' | 'BXDCBOT_RUN_RESULT'
  /** 异步任务结果消息：关联的 async_tasks.id */
  asyncTaskId?: string | null
  /** 异步任务结果消息：LLM 续答是否尚未生成（1=pending，0=done） */
  summaryPending?: number | null
  /** 异步任务结果消息：LLM 续答总结（Markdown 文本） */
  summaryText?: string | null
  /** 异步任务结果消息：LLM 续答完成时间（毫秒时间戳） */
  summaryGeneratedAt?: number | null
  /** BxdcbotRun：Bxdcbot 自规划调子 skill 时的 runId */
  parentToolId?: string | null
  /** BxdcbotRun：Bxdcbot 自规划 skillId */
  parentSkillId?: number | null
  /** Sub-agent think blocks rendered as collapsible sections within execution block */
  thinkBlocks?: ThinkBlock[]
  /** 正文段落：文字和 think 块穿插排列，用于 inline 渲染 */
  contentSegments?: ContentSegment[]
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeToolName(toolCall: any, fallback?: string): string | null {
  const name = toolCall?.name
    ?? toolCall?.function?.name
    ?? toolCall?.kwargs?.name
    ?? fallback

  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function normalizeToolId(toolCall: any, fallback: string): string {
  const id = toolCall?.id ?? toolCall?.tool_call_id ?? toolCall?.function?.id
  return typeof id === 'string' && id.trim() ? id.trim() : fallback
}

function toolCallIdFromToolResultMessage(message: any, messageIndex: number, toolName: string): string {
  const id = message?.tool_call_id ?? message?.kwargs?.tool_call_id ?? message?.lc_kwargs?.tool_call_id
  if (typeof id === 'string' && id.trim()) return id.trim()
  return `${toolName}:toolmsg:${messageIndex}`
}

function inferToolKind(toolName: string): 'skill' | 'tool' {
  return toolName.startsWith('skill_')
    || toolName.startsWith('extended_')
    || toolName.startsWith('extended-')
    ? 'skill'
    : 'tool'
}

export interface ChatState {
  messages: ReturnType<typeof ref<Message[]>>
  isThinking: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  clearError: () => void
  sendMessage: (content: string, userId?: string, attachedFiles?: UploadFileInfo[], memoryEnabled?: boolean) => Promise<void>
  /** Stop the current in-flight SSE stream (cancel button while agent is reasoning). */
  stop: () => void
  addMessage: (message: Message) => void
  confirmSkillAction: (toolCallId: string, sessionId: string, confirmed: boolean, adjustedParams?: Record<string, unknown>) => Promise<void>
  updateConfirmationArguments: (toolCallId: string, adjustedParams: Record<string, unknown>) => void
  /** Callback invoked after SSE stream completes; ChatView sets this to persist conversation messages */
  saveMessageCallback: ReturnType<typeof ref<((messages: Message[]) => void) | null>>
}

const ChatKey: InjectionKey<ChatState> = Symbol('chat')

export function provideChat() {
  const messages = ref<Message[]>([])
  const isThinking = ref(false)
  const error = ref<string | null>(null)
  const activeSessionId = ref<string | null>(null)
  const saveMessageCallback = ref<((messages: Message[]) => void) | null>(null)
  /** AbortController for the current in-flight SSE stream; null when no stream is active. */
  let currentAbortController: AbortController | null = null
  /** Stream reader for the current SSE stream; null when no stream is active. */
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const { createSession, processStreamEvent, completeSession } = useThinkingMode()
  const fileUpload = useFileUpload()

  function clearError() {
    error.value = null
  }

  function generateConversationSessionId(): string {
    // 为每条消息生成唯一的 sessionId，确保每条消息有独立的思考状态
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  function updateLastAssistantMessage(updater: (message: Message) => Message) {
    if (messages.value.length === 0) return

    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'assistant') return

    messages.value = [
      ...messages.value.slice(0, -1),
      updater(last),
    ]
  }

  function addMessage(message: Message) {
    messages.value = [...messages.value, message]
  }

  function upsertLlmLogEntry(entry: LlmLogEntry) {
    updateLastAssistantMessage((last) => {
      const prevLogs = last.llmLogs ?? []
      const wasNew = !prevLogs.some((e) => e.id === entry.id)
      const llmLogs = mergeLlmLogEntries(prevLogs, entry)
      const logTimeline = [...(last.logTimeline ?? [])]
      if (wasNew) {
        logTimeline.push({ kind: 'llm', id: entry.id })
      }
      return {
        ...last,
        llmLogs,
        logTimeline,
      }
    })
  }

  /** Ensure the last segment is a text segment, or create one. Returns the segments array. */
  function ensureLastTextSegment(last: Message): ContentSegment[] {
    const segments = last.contentSegments && last.contentSegments.length > 0
      ? [...last.contentSegments]
      : (last.content ? [{ type: 'text' as const, text: last.content }] : [])
    const lastSeg = segments[segments.length - 1]
    if (!lastSeg || lastSeg.type !== 'text') {
      // Only create empty text segment if there's existing content (avoid leading empty block)
      if (segments.length > 0 && last.content) {
        segments.push({ type: 'text', text: '' })
      }
    }
    return segments
  }

  function setLastMessage(content: string) {
    updateLastAssistantMessage((last) => ({
      ...last,
      content,
      // contentSegments 由 applyAssistantContent 和 think_start 维护，这里不重建
    }))
  }

  function applyAssistantContent(rawContent: string) {
    const content = removeThinkTags(rawContent)
    if (!content && content !== '') return

    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'assistant') return

    if (!last.content) {
      setLastMessage(content)
      return
    }

    let newPart: string
    if (content.startsWith(last.content)) {
      newPart = content.slice(last.content.length)
      if (newPart.length === 0) return
    } else {
      newPart = content
    }

    updateLastAssistantMessage((current) => {
      const segments = ensureLastTextSegment(current)
      const lastTextSeg = segments[segments.length - 1] as { type: 'text'; text: string }
      lastTextSeg.text = lastTextSeg.text + newPart
      return {
        ...current,
        content: current.content + newPart,
        contentSegments: [...segments],
      }
    })
  }

  function getChunkMessages(data: any): any[] {
    if (!data || typeof data !== 'object') return []

    const messages: any[] = [
      ...asArray(data.agent?.messages),
      ...asArray(data.messages),
      ...asArray(data.message),
    ]
    
    // 如果顶层对象看起来像个消息（有 content 和 role），也加进去
    // 这对于直接返回 AIMessageChunk 的情况很重要
    if (data.content !== undefined && (data.role || data.type)) {
      messages.push(data)
    }
    
    return messages
  }

  function inferMessageKind(message: any): string {
    const nestedType = message?.kwargs?.type
    if (typeof nestedType === 'string') return nestedType.toLowerCase()

    const explicitType = message?.type
    if (typeof explicitType === 'string') return explicitType.toLowerCase()

    const nestedRole = message?.kwargs?.role
    if (typeof nestedRole === 'string') return nestedRole.toLowerCase()

    const role = message?.role
    if (typeof role === 'string') return role.toLowerCase()

    const id = message?.id
    if (typeof id === 'string') return id.toLowerCase()
    if (Array.isArray(id)) return id.join('.').toLowerCase()

    // 兜底：如果看起来像 chunk
    if (message?.content !== undefined) return 'aimessagechunk'

    return ''
  }

  function isAssistantMessage(message: any): boolean {
    const kind = inferMessageKind(message)
    return kind.includes('assistant') || kind.includes('aimessage') || kind.includes('ai')
  }

  function isToolMessage(message: any): boolean {
    const kind = inferMessageKind(message)
    return kind.includes('toolmessage') || kind === 'tool'
  }

  function removeThinkTags(content: string): string {
    // 移除 <think>...</think> 标签及其内容
    return content.replace(/<think[\s\S]*?<\/think>/gi, '')
  }

  function extractContent(content: unknown): string | null {
    if (typeof content === 'string') {
      // 过滤 think 标签
      return removeThinkTags(content)
    }
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') return removeThinkTags(part)
          if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
            return removeThinkTags((part as any).text)
          }
          return ''
        })
        .join('')
      return text || null
    }
    return null
  }

  function getMessageContent(message: any): string | null {
    return extractContent(message?.kwargs?.content)
      ?? extractContent(message?.content)
      ?? null
  }

  function extractMessageContent(data: any): string | null {
    if (typeof data === 'string') return data
    if (!data || typeof data !== 'object') return null
    if (data.type === 'tool_status' || data.type === 'confirmation_request') return null

    // 1. 尝试从 messages 数组中获取
    const assistantMessages = getChunkMessages(data)
      .filter((message) => isAssistantMessage(message))
    
    if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
        const chunkAssistantContent = getMessageContent(lastAssistantMessage)
        // 允许空字符串（""），因为有时候 chunk 就是空的但有效
        if (chunkAssistantContent !== null) return chunkAssistantContent
    }

    // 2. 尝试直接作为 Message 对象处理
    if (isAssistantMessage(data.message)) {
      const simpleMsg = getMessageContent(data.message)
      if (simpleMsg !== null) return simpleMsg
    }

    if (isAssistantMessage(data)) {
      const rootMsg = getMessageContent(data)
      if (rootMsg !== null) return rootMsg
    }
    
    // 3. 最后的兜底：如果有一个 content 字段，且没有 tool_calls，假设它是内容
    if (typeof data.content === 'string' && !data.tool_calls && !data.kwargs?.tool_calls) {
      return removeThinkTags(data.content)
    }

    return null
  }

  function getToolCallEntries(message: any): any[] {
    return [
      ...asArray(message?.tool_calls),
      ...asArray(message?.kwargs?.tool_calls),
      ...asArray(message?.additional_kwargs?.tool_calls),
      ...asArray(message?.kwargs?.additional_kwargs?.tool_calls),
    ]
  }

  function describeToolName(toolName: string): string {
    return toolName
      .replace(/^skill_/, '')
      .replace(/_/g, '-')
  }

  function isGenericToolDisplayName(toolName: string, displayName: string): boolean {
    return displayName === describeToolName(toolName)
  }

  function extractToolInvocationsFromChunk(data: any): ToolInvocation[] {
    return getChunkMessages(data).flatMap((message, messageIndex): ToolInvocation[] => {
      const toolCalls = getToolCallEntries(message)
      if (toolCalls.length > 0) {
        return toolCalls
          .map((toolCall, toolIndex) => {
            const toolName = normalizeToolName(toolCall)
            if (!toolName) return null

            return {
              id: normalizeToolId(toolCall, `${toolName}:${messageIndex}:${toolIndex}`),
              name: toolName,
              displayName: describeToolName(toolName),
              kind: inferToolKind(toolName),
              status: 'running' as ToolInvocationStatus,
              arguments: extractArgumentsFromToolCallPayload(toolCall),
              children: [],
            }
          })
          .filter(Boolean) as ToolInvocation[]
      }

      if (!isToolMessage(message)) return []

      const toolName = normalizeToolName(message, message?.kwargs?.name)
      if (!toolName) return []

      const content = String(message?.content ?? message?.kwargs?.content ?? '').toLowerCase()
      return [{
        id: toolCallIdFromToolResultMessage(message, messageIndex, toolName),
        name: toolName,
        displayName: describeToolName(toolName),
        kind: inferToolKind(toolName),
        status: content.startsWith('error') ? 'failed' : 'completed',
        arguments: extractArgumentsFromToolResultMessage(message),
        children: [],
      }]
    })
  }

  function isToolStatusEvent(data: any): data is {
    type: 'tool_status'
    toolId: string
    toolName: string
    displayName: string
    kind: 'skill' | 'tool'
    status: ToolInvocationStatus
    parentToolId?: string
    parentToolName?: string
    summary?: string
    arguments?: unknown
    result?: string
    executionMode?: string
    executionLabel?: string
  } {
    return data?.type === 'tool_status'
      && typeof data.toolId === 'string'
      && typeof data.toolName === 'string'
      && typeof data.displayName === 'string'
      && (data.kind === 'skill' || data.kind === 'tool')
      && ['running', 'completed', 'failed'].includes(data.status)
  }

  function mergeToolResultField(previous: string | undefined, next: string | undefined): string | undefined {
    return next !== undefined ? next : previous
  }

  function upsertChildToolInvocation(children: ToolInvocation[], toolEvent: {
    toolId: string
    toolName: string
    displayName: string
    kind: 'skill' | 'tool'
    status: ToolInvocationStatus
    summary?: string
    arguments?: unknown
    result?: string
  }) {
    const nextChildren = [...children]
    const existingIndex = nextChildren.findIndex((tool) => tool.id === toolEvent.toolId)
    const previous = existingIndex >= 0 ? nextChildren[existingIndex] : null
    const nextChild: ToolInvocation = {
      id: toolEvent.toolId,
      name: toolEvent.toolName,
      displayName: toolEvent.displayName,
      kind: toolEvent.kind,
      status: toolEvent.status,
      summary: toolEvent.summary,
      arguments: mergeToolArgumentsField(previous?.arguments, toolEvent.arguments),
      result: mergeToolResultField(previous?.result, toolEvent.result),
      children: previous?.children ?? [],
    }

    if (existingIndex >= 0) {
      nextChildren.splice(existingIndex, 1, nextChild)
    } else {
      nextChildren.push(nextChild)
    }

    return nextChildren
  }

  function appendToolTimelineEntry(toolId: string) {
    updateLastAssistantMessage((last) => {
      const logTimeline = [...(last.logTimeline ?? [])]
      if (logTimeline.some((t) => t.kind === 'tool' && t.id === toolId)) {
        return last
      }
      logTimeline.push({ kind: 'tool', id: toolId })
      return { ...last, logTimeline }
    })
  }

  function applyConfirmationExecutionOutcome(
    confirmations: ConfirmationRequest[],
    toolId: string,
    toolStatus: ToolInvocationStatus,
  ): ConfirmationRequest[] {
    console.log(`[DEBUG] applyConfirmationExecutionOutcome: toolId=${toolId}, toolStatus=${toolStatus}, confirmations count=${confirmations.length}`);
    for (const c of confirmations) {
      console.log(`[DEBUG]   checking confirmation: toolCallId=${c.toolCallId}, status=${c.status}, match=${c.toolCallId === toolId}`);
    }
    if (toolStatus !== 'completed' && toolStatus !== 'failed') return confirmations
    const updated: ConfirmationRequest[] = confirmations.map((c) =>
      c.toolCallId === toolId && c.status === 'confirmed'
        ? {
            ...c,
            executionOutcome: (toolStatus === 'completed' ? 'completed' : 'failed') as 'completed' | 'failed',
          }
        : c,
    )
    console.log(`[DEBUG] applyConfirmationExecutionOutcome result:`, updated);
    return updated
  }

  function upsertToolInvocation(toolEvent: {
    toolId: string
    toolName: string
    displayName: string
    kind: 'skill' | 'tool'
    status: ToolInvocationStatus
    parentToolId?: string
    parentToolName?: string
    summary?: string
    arguments?: unknown
    result?: string
    executionMode?: string
    executionLabel?: string
  }) {
    updateLastAssistantMessage((last) => {
      const toolInvocations = [...(last.toolInvocations ?? [])]
      if (toolEvent.parentToolId || toolEvent.parentToolName) {
        const parentIndex = toolInvocations.findIndex((tool) => tool.id === toolEvent.parentToolId)
        const fallbackParentIndex = parentIndex >= 0
          ? parentIndex
          : toolInvocations.findIndex((tool) => tool.name === toolEvent.parentToolName)
        const targetParentIndex = parentIndex >= 0 ? parentIndex : fallbackParentIndex
        const parent: ToolInvocation = targetParentIndex >= 0 && toolInvocations[targetParentIndex]
          ? toolInvocations[targetParentIndex]
          : {
            id: toolEvent.parentToolId || toolEvent.parentToolName || toolEvent.toolId,
            name: toolEvent.parentToolName || toolEvent.parentToolId || toolEvent.toolName,
            displayName: toolEvent.parentToolName || toolEvent.parentToolId || toolEvent.displayName,
            kind: 'skill' as const,
            status: 'running' as ToolInvocationStatus,
            children: [],
          }

        const nextParent: ToolInvocation = {
          ...parent,
          children: upsertChildToolInvocation(parent.children ?? [], {
            toolId: toolEvent.toolId,
            toolName: toolEvent.toolName,
            displayName: toolEvent.displayName,
            kind: toolEvent.kind,
            status: toolEvent.status,
            summary: toolEvent.summary,
            arguments: toolEvent.arguments,
            result: toolEvent.result,
          }),
        }

        if (targetParentIndex >= 0) {
          toolInvocations.splice(targetParentIndex, 1, nextParent)
        } else {
          toolInvocations.push(nextParent)
        }

        const confirmations = applyConfirmationExecutionOutcome(
          last.confirmations ?? [],
          toolEvent.toolId,
          toolEvent.status,
        )

        if (toolEvent.status === 'failed' && toolEvent.result) {
          console.warn(`[skill] upsertTool FAILED (child): tool=${toolEvent.toolName} (${toolEvent.toolId})`, {
            result: typeof toolEvent.result === 'string' ? toolEvent.result.slice(0, 500) : toolEvent.result,
          })
        }

        return {
          ...last,
          toolInvocations,
          confirmations,
        }
      }

      const existingIndex = toolInvocations.findIndex((tool) => tool.id === toolEvent.toolId)
      const previousTool = existingIndex >= 0 ? toolInvocations[existingIndex] : null
      const nextDisplayName = previousTool
        && isGenericToolDisplayName(toolEvent.toolName, toolEvent.displayName)
        && !isGenericToolDisplayName(previousTool.name, previousTool.displayName)
        ? previousTool.displayName
        : toolEvent.displayName

      const nextTool: ToolInvocation = {
        id: toolEvent.toolId,
        name: toolEvent.toolName,
        displayName: nextDisplayName,
        kind: toolEvent.kind,
        status: toolEvent.status,
        summary: toolEvent.summary,
        arguments: mergeToolArgumentsField(previousTool?.arguments, toolEvent.arguments),
        result: mergeToolResultField(previousTool?.result, toolEvent.result),
        executionMode: toolEvent.executionMode,
        executionLabel: toolEvent.executionLabel,
        children: previousTool?.children ?? [],
      }

      if (existingIndex >= 0) {
        toolInvocations.splice(existingIndex, 1, nextTool)
      } else {
        toolInvocations.push(nextTool)
      }

      const confirmations = applyConfirmationExecutionOutcome(
        last.confirmations ?? [],
        toolEvent.toolId,
        toolEvent.status,
      )

      if (toolEvent.status === 'failed' && toolEvent.result) {
        console.warn(`[skill] upsertTool FAILED: tool=${toolEvent.toolName} (${toolEvent.toolId})`, {
          result: typeof toolEvent.result === 'string' ? toolEvent.result.slice(0, 500) : toolEvent.result,
        })
      }

      return {
        ...last,
        toolInvocations,
        confirmations,
      }
    })
  }

  function settleLastToolInvocations(status: ToolInvocationStatus) {
    updateLastAssistantMessage((last) => ({
      ...last,
      toolInvocations: (last.toolInvocations ?? []).map((tool) => ({
        ...tool,
        status: tool.status === 'running' ? status : tool.status,
        children: (tool.children ?? []).map((child) => (
          child.status === 'running'
            ? { ...child, status }
            : child
        )),
      })),
      confirmations: (last.confirmations ?? []).map((c) =>
        c.status === 'pending' ? { ...c, status: 'expired' as ConfirmationStatus } : c,
      ),
      thinkBlocks: (last.thinkBlocks ?? []).map((tb) => (
        tb.status === 'running'
          ? { ...tb, status, completedAt: Date.now() }
          : tb
      )),
    }))
  }

  function isConfirmationRequestEvent(data: any): data is {
    type: 'confirmation_request'
    sessionId: string
    toolCallId: string
    toolName: string
    skillName: string
    summary: string
    details: string
    arguments?: unknown
  } {
    return data?.type === 'confirmation_request'
      && typeof data.sessionId === 'string'
      && typeof data.toolCallId === 'string'
  }

  function isThinkStartEvent(data: any): data is {
    type: 'think_start'
    thinkId: string
    parentToolId: string
    parentToolName: string
    displayName: string
  } {
    return data?.type === 'think_start'
      && typeof data.thinkId === 'string'
      && typeof data.parentToolId === 'string'
  }

  function isAgentTextEvent(data: any): data is {
    type: 'agent_text'
    thinkId: string
    role: 'sub_agent' | 'main_agent'
    content: string
    replace?: boolean
  } {
    return data?.type === 'agent_text'
      && typeof data.thinkId === 'string'
      && (data.role === 'sub_agent' || data.role === 'main_agent')
      && typeof data.content === 'string'
  }

  function isThinkEndEvent(data: any): data is {
    type: 'think_end'
    thinkId: string
    parentToolId: string
    status: 'completed' | 'failed'
  } {
    return data?.type === 'think_end'
      && typeof data.thinkId === 'string'
      && typeof data.parentToolId === 'string'
  }

  function addConfirmationToLastAssistant(req: ConfirmationRequest) {
    updateLastAssistantMessage((last) => ({
      ...last,
      confirmations: [...(last.confirmations ?? []), req],
    }))
  }

  function updateConfirmationStatus(toolCallId: string, status: ConfirmationStatus) {
    updateLastAssistantMessage((last) => ({
      ...last,
      confirmations: (last.confirmations ?? []).map((c) => {
        if (c.toolCallId !== toolCallId) return c
        if (status === 'confirmed') {
          return { ...c, status, executionOutcome: 'running' }
        }
        return { ...c, status, executionOutcome: undefined }
      }),
    }))
  }

  async function confirmSkillAction(toolCallId: string, sessionId: string, confirmed: boolean, adjustedParams?: Record<string, unknown>) {
    console.log(`[DEBUG-confirmation] confirmSkillAction called: toolCallId=${toolCallId}, sessionId=${sessionId}, confirmed=${confirmed}`);

    const newStatus: ConfirmationStatus = confirmed ? 'confirmed' : 'cancelled'
    updateConfirmationStatus(toolCallId, newStatus)
    console.log(`[DEBUG-confirmation] updateConfirmationStatus called: toolCallId=${toolCallId}, newStatus=${newStatus}`);

    if (confirmed) {
      console.log(`[skill] confirmAction SEND: toolCallId=${toolCallId} confirmed=true`, {
        adjustedParams,
        sessionId,
      })
    } else {
      console.log(`[skill] confirmAction SEND: toolCallId=${toolCallId} confirmed=false`)
    }

    try {
      console.log(`[DEBUG-confirmation] calling confirmAction API: sessionId=${sessionId}, toolCallId=${toolCallId}, confirmed=${confirmed}`);
      await confirmAction(sessionId, toolCallId, confirmed, adjustedParams)
      console.log(`[DEBUG-confirmation] confirmAction API success: toolCallId=${toolCallId}`);
      console.log(`[skill] confirmAction OK: toolCallId=${toolCallId} confirmed=${confirmed}`)
    } catch (e) {
      console.error(`[DEBUG-confirmation] confirmAction API failed:`, e);
      console.error(`[skill] confirmAction FAILED: toolCallId=${toolCallId}`, e)
      updateConfirmationStatus(toolCallId, 'pending')
      error.value = e instanceof Error ? e.message : 'Confirmation request failed'
    }
  }

  function updateConfirmationArguments(toolCallId: string, adjustedParams: Record<string, unknown>) {
    updateLastAssistantMessage((last) => ({
      ...last,
      confirmations: (last.confirmations ?? []).map((c) => {
        if (c.toolCallId !== toolCallId) return c;
        return { ...c, arguments: adjustedParams };
      }),
      toolInvocations: (last.toolInvocations ?? []).map((t) => {
        if (t.id !== toolCallId) return t;
        return { ...t, arguments: adjustedParams };
      }),
    }));
  }

  async function sendMessage(content: string, userId?: string, attachedFiles?: UploadFileInfo[], memoryEnabled?: boolean) {
    if (isThinking.value) return

    const conversationEnabledSkillIds = (() => {
      try {
        const conversations = useConversations()
        return conversations.getEnabledSkillIds(conversations.currentConversationId.value ?? '')
      } catch {
        return []
      }
    })()
    const conversationId = (() => {
      try {
        return useConversations().currentConversationId.value ?? ''
      } catch {
        return ''
      }
    })()

    const messageCountBeforeSend = messages.value.length

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    addMessage(userMessage)
    isThinking.value = true
    error.value = null
    // Prevent switching conversations mid-stream
    try { useConversations().isProcessing.value = true } catch { /* fail-safe */ }

    try {
      // Get recent history (e.g., last 10 messages) to provide short-term context
      const history = messages.value.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const sessionId = generateConversationSessionId()
      activeSessionId.value = sessionId

      // 初始化思考模式会话
      createSession(sessionId)

      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        sessionId,
        toolInvocations: [],
        llmLogs: [],
        logTimeline: [],
      })

      const url = getAgentStreamUrl()

      // 创建 AbortController 绑定到本轮 SSE 流，stop() 时 abort + reader.cancel() 双重中断
      const abortController = new AbortController()
      currentAbortController = abortController

      // 拼接文件解析内容到 instruction（任务 8 拼接，任务 pass-parsed-content-to-llm 改用统一截断逻辑）
      let finalInstruction = content
      if (attachedFiles && attachedFiles.length > 0) {
        // sendMessage 在函数体内调用 useFileUpload() 会让 inject 失败（currentInstance 为 null），
        // 降级分支返回新的空 state，getAllParsedText() 因此返回空。
        // 解决：在 MessageInput 端拿到 fileUpload state，把截断函数传一个能接受 files 参数的实现。
        const fileUpload = useFileUpload()
        const fileParts = fileUpload.getAllParsedText(attachedFiles)
        if (fileParts.length > 0) {
          finalInstruction = `${content}\n\n${fileParts}`
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          instruction: finalInstruction,
          context: {
            userId,
            sessionId,
          },
          history,
          enabledSkillIds: conversationEnabledSkillIds,
          conversationId,
          // 记忆开关：默认 true；为 false 时后端不读记忆也不写记忆
          memoryEnabled: memoryEnabled !== false,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        console.error('[skill] Failed to connect to agent:', response.statusText)
        currentAbortController = null
        isThinking.value = false
        try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
        error.value = 'Failed to connect to agent'
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        console.error('[skill] No response body')
        currentAbortController = null
        isThinking.value = false
        try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
        return
      }
      currentReader = reader

      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('Stream complete')
          currentReader = null
          currentAbortController = null
          settleLastToolInvocations('completed')
          isThinking.value = false
          try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
          // 完成思考模式会话
          if (activeSessionId.value) {
            completeSession(activeSessionId.value)
          }
          activeSessionId.value = null

          // Persist messages to conversation (Phase 2)
          if (saveMessageCallback.value) {
            try {
              saveMessageCallback.value(messages.value.slice(messageCountBeforeSend))
            } catch (e) {
              console.error('[chat] Failed to save messages:', e)
            }
          }

          // Refresh conversation cache (sync enabled_skills after Agent creates skills)
          try {
            const uid = userId ?? ''
            if (uid) await useConversations().refreshConversations(uid)
          } catch (e) {
            console.error('[chat] Failed to refresh conversations:', e)
          }

          // 上报本次对话涉及的文件名（任务 8.3）
          if (attachedFiles && attachedFiles.length > 0 && userId && memoryEnabled !== false) {
            const fileNames = attachedFiles.map((f) => f.fileName)
            try {
              await fetch(agentUrl('/memory/add'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  // X-User-Id header 跨用户守卫（spec memory-initialization-flow）
                  'X-User-Id': userId,
                },
                body: JSON.stringify({
                  userId,
                  text: `本次对话涉及文件：${fileNames.join('、')}`,
                  role: 'system',
                }),
              })
            } catch (e) {
              console.error('[chat] Failed to add file memory:', e)
            }
          }

          break
        }

        buffer += decoder.decode(value, { stream: true })
        
        // 按行处理 SSE 格式的数据
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            // 解析 SSE 格式：data: {"key": "value"}
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              if (!jsonStr.trim()) continue
              
              let data: any
              try {
                data = JSON.parse(jsonStr)
              } catch {
                const hasRunningThink = (messages.value[messages.value.length - 1]?.thinkBlocks ?? [])
                  .some((tb: any) => tb.status === 'running')
                if (!hasRunningThink) {
                  applyAssistantContent(jsonStr)
                }
                continue
              }

              console.log('Received JSON data:', data)
              
              // 处理思考模式节点
              if (activeSessionId.value) {
                processStreamEvent(activeSessionId.value, data)
              }
              
              if (isLlmLogEvent(data)) {
                if (activeSessionId.value && data.entry.sessionId === activeSessionId.value) {
                  upsertLlmLogEntry(data.entry)
                }
                continue
              }

              if (isToolStatusEvent(data)) {
                if (data.status === 'failed') {
                  console.warn(`[skill] tool_status FAILED: tool=${data.toolName} (${data.toolId}) kind=${data.kind}`, {
                    result: data.result,
                    arguments: data.arguments,
                  })
                } else if (data.status === 'completed') {
                  console.log(`[skill] tool_status completed: tool=${data.toolName} (${data.toolId}) kind=${data.kind} resultLen=${typeof data.result === 'string' ? data.result.length : 'N/A'}`)
                } else {
                  console.log(`[skill] tool_status running: tool=${data.toolName} (${data.toolId}) kind=${data.kind}`)
                }
                upsertToolInvocation(data)
                appendToolTimelineEntry(data.toolId)
                continue
              }

              if (isConfirmationRequestEvent(data)) {
                console.log(`[skill] confirmation_request: skill=${data.skillName} tool=${data.toolName} toolCallId=${data.toolCallId}`, {
                  arguments: data.arguments,
                })
                addConfirmationToLastAssistant({
                  sessionId: data.sessionId,
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  skillName: data.skillName,
                  summary: data.summary,
                  details: data.details,
                  arguments: data.arguments,
                  status: 'pending',
                })
                continue
              }

              if (isThinkStartEvent(data)) {
                console.log(`[ThinkBlock] Frontend received think_start: thinkId=${data.thinkId}, parentToolId=${data.parentToolId}`)
                updateLastAssistantMessage((last) => {
                  // Flush current text into segments, then insert think segment
                  const segments = ensureLastTextSegment(last)
                  segments.push({ type: 'think', thinkId: data.thinkId })
                  return {
                    ...last,
                    contentSegments: [...segments],
                    thinkBlocks: [
                      ...(last.thinkBlocks ?? []),
                      {
                        id: data.thinkId,
                        parentToolId: data.parentToolId,
                        parentToolName: data.parentToolName,
                        content: '',
                        summary: data.parentToolName || '',
                        status: 'running' as const,
                        startedAt: Date.now(),
                      },
                    ],
                  }
                })
                continue
              }

              if (isAgentTextEvent(data)) {
                updateLastAssistantMessage((last) => {
                  const thinkBlocks = (last.thinkBlocks ?? []).map((tb) => {
                    if (tb.id === data.thinkId) {
                      const newContent = data.replace ? data.content : tb.content + data.content
                      let summary = tb.summary
                      if (!summary && newContent.trim()) {
                        const firstLine = (newContent.split('\n')[0] || '').replace(/^#+\s*/, '').trim()
                        const thinkingPrefixes = ['我来', '让我', '尝试', '开始', '现在', '接下来', '将', '准备', '正在']
                        let processedLine = firstLine
                        for (const prefix of thinkingPrefixes) {
                          if (processedLine.startsWith(prefix)) {
                            processedLine = processedLine.slice(prefix.length).trim()
                            break
                          }
                        }
                        summary = processedLine.length > 2
                          ? (processedLine.length > 60 ? processedLine.slice(0, 60) + '…' : processedLine)
                          : '执行中...'
                      }
                      if (data.replace) {
                        return { ...tb, content: data.content, summary }
                      }
                      return { ...tb, content: tb.content + data.content, summary }
                    }
                    return tb
                  })
                  return { ...last, thinkBlocks }
                })
                continue
              }

              if (isThinkEndEvent(data)) {
                updateLastAssistantMessage((last) => {
                  const thinkBlocks = (last.thinkBlocks ?? []).map((tb) => {
                    if (tb.id === data.thinkId) {
                      return {
                        ...tb,
                        status: data.status,
                        completedAt: Date.now(),
                      }
                    }
                    return tb
                  })
                  return { ...last, thinkBlocks }
                })
                continue
              }

              const rawToolInvocations = extractToolInvocationsFromChunk(data)
              if (rawToolInvocations.length > 0) {
                rawToolInvocations.forEach((toolInvocation) => {
                  upsertToolInvocation({
                    toolId: toolInvocation.id,
                    toolName: toolInvocation.name,
                    displayName: toolInvocation.displayName,
                    kind: toolInvocation.kind,
                    status: toolInvocation.status,
                    arguments: toolInvocation.arguments,
                    executionMode: toolInvocation.executionMode,
                    executionLabel: toolInvocation.executionLabel,
                  })
                  appendToolTimelineEntry(toolInvocation.id)
                })
              }

              if (typeof data?.error === 'string') {
                console.error(`[skill] SSE error event: ${data.error}`)
                error.value = data.error
                settleLastToolInvocations('failed')
                isThinking.value = false
                try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
                return
              }

              // 输出守卫修正：后端剥离了编造的下载链接，整段覆盖已渲染内容
              if (data?.replace === true && typeof data.content === 'string' && (data.role === 'assistant' || data.role === undefined)) {
                setLastMessage(removeThinkTags(data.content))
                continue
              }

              // think 块运行时丢弃主文本（子 Agent token 已由 agent_text 事件独立投递到 think 块）
              // 但如果内容以换行开头（通常是取消/完成提示），仍然应用
              const hasRunningThink = (messages.value[messages.value.length - 1]?.thinkBlocks ?? [])
                .some((tb) => tb.status === 'running')

              const extracted = extractMessageContent(data)
              if (extracted !== null) {
                if (!hasRunningThink || extracted.trim() === '' || extracted.startsWith('\n')) {
                  applyAssistantContent(extracted)
                }
              } else {
                console.log('No content extracted from data')
              }
            }
          } catch (e) {
            console.error('Error handling event:', e)
          }
        }
      }
    } catch (err) {
      // 用户主动 stop 时会触发 AbortError，不当错误处理（stop() 已重置状态）
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
        || (err as any)?.name === 'AbortError'
      if (isAbort) {
        console.log('[skill] Stream aborted by user')
      } else {
        console.error('[skill] Failed to send message:', err)
        error.value = err instanceof Error ? err.message : 'Failed to send message'
        isThinking.value = false
        try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
        activeSessionId.value = null
      }
    } finally {
      currentReader = null
      currentAbortController = null
      // 发送完成后清空文件状态（任务 8.4）
      if (attachedFiles && attachedFiles.length > 0) {
        fileUpload.clearFiles()
      }
    }
  }

  /**
   * 停止当前 SSE 流：双保险中断 fetch + reader，让 Agent 端的 LLM 推理停止，
   * 关闭思考会话、清空 isThinking，前端可立即输入下一条消息。
   */
  function stop(): void {
    const controller = currentAbortController
    const r = currentReader
    if (!controller && !r) {
      // 没有正在进行的流：仅作为保险，确保 isThinking 状态被重置
      isThinking.value = false
      try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
      return
    }
    // 1) cancel reader（最稳，立刻让 while 循环的 await reader.read() 抛错或返回 done）
    if (r) {
      try { r.cancel().catch(() => { /* swallow */ }) } catch { /* ignore */ }
    }
    // 2) abort fetch（兜底，确保后端 fetch 也被取消）
    if (controller) {
      try { controller.abort() } catch { /* ignore */ }
    }
    currentAbortController = null
    currentReader = null
    // 3) 重置前端状态（reader.cancel() 触发的 reject 会被 catch 兜底）
    settleLastToolInvocations('failed')
    isThinking.value = false
    try { useConversations().isProcessing.value = false } catch { /* fail-safe */ }
    if (activeSessionId.value) {
      completeSession(activeSessionId.value)
    }
    activeSessionId.value = null
    // 在最后一条 assistant 消息末尾追加 "（已停止）" 提示
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant') {
      const suffix = '\n\n_（用户已停止生成）_'
      updateLastAssistantMessage((prev) => ({ ...prev, content: (prev.content || '') + suffix }))
    }
    error.value = null
  }

  const state: ChatState = {
    messages,
    isThinking,
    error,
    clearError,
    sendMessage,
    stop,
    addMessage,
    confirmSkillAction,
    updateConfirmationArguments,
    saveMessageCallback,
  }
  provide(ChatKey, state)
  return state
}

export function useChat(): ChatState {
  const state = inject(ChatKey)
  if (!state) throw new Error('useChat must be used within a provider that calls provideChat()')
  return state
}
