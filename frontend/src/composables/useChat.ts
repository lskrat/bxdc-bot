import { ref, provide, inject, type InjectionKey } from 'vue'
import { createTask, getEventSourceUrl } from '../services/api'
import { agentUrl } from '../services/config'
import { useUser } from './useUser'

export type ToolInvocationStatus = 'running' | 'completed' | 'failed'

export interface ToolInvocation {
  id: string
  name: string
  displayName: string
  kind: 'skill' | 'tool'
  status: ToolInvocationStatus
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolInvocations?: ToolInvocation[]
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export interface ChatState {
  messages: ReturnType<typeof ref<Message[]>>
  isThinking: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  sendMessage: (content: string, userId?: string) => Promise<void>
  addMessage: (message: Message) => void
  fetchGreeting: () => Promise<void>
}

const ChatKey: InjectionKey<ChatState> = Symbol('chat')

export function provideChat() {
  const messages = ref<Message[]>([])
  const isThinking = ref(false)
  const error = ref<string | null>(null)
  const { currentUser } = useUser()

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

  function setLastMessage(content: string) {
    updateLastAssistantMessage((last) => ({ ...last, content }))
  }

  function applyAssistantContent(rawContent: string) {
    const content = rawContent
    
    // 如果为空字符串，我们仍然可能需要处理（例如初始状态），但如果是纯空白字符通常可以忽略
    // 但是对于流式传输，有时会收到空包
    if (!content && content !== '') return

    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'assistant') return

    // 如果还没有内容，直接设置
    if (!last.content) {
      setLastMessage(content)
      return
    }

    // 检查是否是全量更新（新内容包含旧内容作为前缀）
    if (content.startsWith(last.content)) {
      setLastMessage(content)
      return
    }

    // 否则当作增量追加
    updateLastAssistantMessage((current) => ({
      ...current,
      content: current.content + content,
    }))
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

  function extractContent(content: unknown): string | null {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
            return (part as any).text
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
    if (data.type === 'tool_status') return null

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
      return data.content
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

  function extractToolInvocationsFromChunk(data: any): ToolInvocation[] {
    return getChunkMessages(data).flatMap((message, messageIndex): ToolInvocation[] => {
      const toolCalls = getToolCallEntries(message)
      if (toolCalls.length > 0) {
        return toolCalls
          .map((toolCall, toolIndex) => {
            const toolName = toolCall?.name ?? toolCall?.function?.name
            if (typeof toolName !== 'string' || !toolName.trim()) return null

            return {
              id: toolCall?.id ?? `${toolName}:${messageIndex}:${toolIndex}`,
              name: toolName,
              displayName: describeToolName(toolName),
              kind: (toolName.startsWith('skill_') ? 'skill' : 'tool') as 'skill' | 'tool',
              status: 'running' as ToolInvocationStatus,
            }
          })
          .filter(Boolean) as ToolInvocation[]
      }

      if (!isToolMessage(message)) return []

      const toolName = message?.name ?? message?.kwargs?.name
      if (typeof toolName !== 'string' || !toolName.trim()) return []

      const content = String(message?.content ?? message?.kwargs?.content ?? '').toLowerCase()
      return [{
        id: message?.tool_call_id ?? message?.kwargs?.tool_call_id ?? toolName,
        name: toolName,
        displayName: describeToolName(toolName),
        kind: toolName.startsWith('skill_') ? 'skill' : 'tool',
        status: content.startsWith('error') ? 'failed' : 'completed',
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
  } {
    return data?.type === 'tool_status'
      && typeof data.toolId === 'string'
      && typeof data.toolName === 'string'
      && typeof data.displayName === 'string'
      && (data.kind === 'skill' || data.kind === 'tool')
      && ['running', 'completed', 'failed'].includes(data.status)
  }

  function upsertToolInvocation(toolEvent: {
    toolId: string
    toolName: string
    displayName: string
    kind: 'skill' | 'tool'
    status: ToolInvocationStatus
  }) {
    updateLastAssistantMessage((last) => {
      const toolInvocations = [...(last.toolInvocations ?? [])]
      const existingIndex = toolInvocations.findIndex((tool) => tool.id === toolEvent.toolId)

      const nextTool: ToolInvocation = {
        id: toolEvent.toolId,
        name: toolEvent.toolName,
        displayName: toolEvent.displayName,
        kind: toolEvent.kind,
        status: toolEvent.status,
      }

      if (existingIndex >= 0) {
        toolInvocations.splice(existingIndex, 1, nextTool)
      } else {
        toolInvocations.push(nextTool)
      }

      return {
        ...last,
        toolInvocations,
      }
    })
  }

  function settleLastToolInvocations(status: ToolInvocationStatus) {
    updateLastAssistantMessage((last) => ({
      ...last,
      toolInvocations: (last.toolInvocations ?? []).map((tool) => (
        tool.status === 'running'
          ? { ...tool, status }
          : tool
      )),
    }))
  }

  async function sendMessage(content: string, userId?: string) {
    if (isThinking.value) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    addMessage(userMessage)
    isThinking.value = true
    error.value = null

    try {
      // Get recent history (e.g., last 10 messages) to provide short-term context
      const history = messages.value
        .slice(-10)
        .map(m => ({
          role: m.role,
          content: m.content
        }))

      const { id } = await createTask(content, userId, history)
      const url = getEventSourceUrl(id)

      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolInvocations: [],
      })

      const eventSource = new EventSource(url)

      eventSource.onmessage = (event) => {
        try {
          if (event.data) {
            let data: any
            try {
              data = JSON.parse(event.data)
            } catch {
              // 纯文本数据
              console.log('Received raw text:', event.data)
              applyAssistantContent(event.data)
              return
            }

            console.log('Received JSON data:', data)
            if (isToolStatusEvent(data)) {
              upsertToolInvocation(data)
              return
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
                })
              })
            }

            if (typeof data?.error === 'string') {
              error.value = data.error
              settleLastToolInvocations('failed')
              isThinking.value = false
              return
            }

            const extracted = extractMessageContent(data)
            if (extracted !== null) {
              console.log('Extracted content:', extracted)
              applyAssistantContent(extracted)
            } else {
              console.log('No content extracted from data')
            }
          }
        } catch (e) {
          console.error('Error handling event:', e)
        }
      }

      eventSource.addEventListener('complete', () => {
        console.log('Stream complete')
        eventSource.close()
        settleLastToolInvocations('completed')
        isThinking.value = false
      })

      eventSource.addEventListener('error', (e) => {
        console.error('SSE Error:', e)
        eventSource.close()
        settleLastToolInvocations('failed')
        isThinking.value = false
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      error.value = err instanceof Error ? err.message : 'Failed to send message'
      isThinking.value = false
    }
  }

  async function fetchGreeting() {
    if (messages.value.length > 0) return
    if (!currentUser.value) return

    try {
        const res = await fetch(agentUrl('/features/avatar/greeting'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nickname: currentUser.value.nickname,
                avatar: currentUser.value.avatar
            })
        });
        const data = await res.json()
        const greetingContent = extractMessageContent(data) ?? data?.greeting ?? null

        if (typeof greetingContent === 'string' && greetingContent.length > 0) {
          addMessage({
            id: 'greeting',
            role: 'assistant',
            content: greetingContent,
            timestamp: Date.now(),
            toolInvocations: []
          })
        }
    } catch (e) {
        console.error("Failed to fetch greeting:", e)
    }
  }

  const state: ChatState = {
    messages,
    isThinking,
    error,
    sendMessage,
    addMessage,
    fetchGreeting
  }
  provide(ChatKey, state)
  return state
}

export function useChat(): ChatState {
  const state = inject(ChatKey)
  if (!state) throw new Error('useChat must be used within a provider that calls provideChat()')
  return state
}
