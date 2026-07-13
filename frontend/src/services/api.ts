import { apiUrl, agentUrl } from './config'
import type {
  ConversationListResponse,
  ConversationDetailResponse,
  SaveMessagesRequest,
  SaveMessagesResponse,
  Conversation,
  CallLogsResponse,
  PublishResponse,
  ApiKeyResponse,
} from '../types/conversation'

export async function createTask(content: string, userId?: string, history?: any[], sessionId?: string): Promise<{ id: string }> {
  const response = await fetch(apiUrl('/api/tasks'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, userId, history, sessionId }),
  })

  if (!response.ok) {
    throw new Error('Failed to create task')
  }

  return response.json()
}

export function getEventSourceUrl(taskId: string): string {
  return apiUrl(`/api/tasks/${taskId}/events`)
}

/**
 * 对话级别 SSE 订阅 URL —— 用于接收 message_inserted / message_updated 事件，
 * 让异步任务完成时新消息自动出现在聊天流（不用刷新页面）。
 *
 * EventSource 浏览器 API 不支持自定义 header，所以 userId 通过 query 参数传入，
 * 服务端用同一套 X-User-Id 校验逻辑做归属判断。
 */
export function getConversationEventSourceUrl(conversationId: string, userId: string): string {
  return apiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/events?userId=${encodeURIComponent(userId)}`)
}

export function getAgentStreamUrl(): string {
  return agentUrl('/agent/run')
}

export async function confirmAction(
  sessionId: string,
  toolCallId: string,
  confirmed: boolean,
  adjustedParams?: Record<string, unknown>,
): Promise<void> {
  const url = agentUrl('/agent/confirm');
  console.log(`[DEBUG-confirmation] confirmAction fetch: url=${url}, sessionId=${sessionId}, toolCallId=${toolCallId}, confirmed=${confirmed}`);
  console.log(`[DEBUG-confirmation] agentBaseUrl: ${import.meta.env.VITE_AGENT_URL}`);
  console.log(`[DEBUG-confirmation] apiBaseUrl: ${import.meta.env.VITE_API_URL}`);
  
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[DEBUG-confirmation] confirmAction TIMEOUT: url=${url}`);
    abortController.abort();
  }, 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, toolCallId, confirmed, adjustedParams }),
      signal: abortController.signal,
    })

    clearTimeout(timeoutId);
    console.log(`[DEBUG-confirmation] confirmAction response: status=${response.status}, ok=${response.ok}, url=${response.url}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[DEBUG-confirmation] confirmAction response body: ${text}`);
      const detail =
        response.status === 404
          ? 'No pending confirmation (session may have expired).'
          : `Confirm request failed (${response.status})`
      throw new Error(detail)
    }
  } catch (e) {
    clearTimeout(timeoutId);
    console.error(`[DEBUG-confirmation] confirmAction ERROR:`, e);
    throw e;
  }
}

function authHeaders(userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  }
}

export async function fetchConversations(userId: string): Promise<ConversationListResponse> {
  const response = await fetch(apiUrl('/api/conversations'), {
    headers: { 'X-User-Id': userId },
  })
  if (!response.ok) throw new Error('Failed to fetch conversations')
  return response.json()
}

export async function createConversation(
  userId: string,
  name?: string,
  enabledSkills?: number[],
): Promise<Conversation> {
  const response = await fetch(apiUrl('/api/conversations'), {
    method: 'POST',
    headers: authHeaders(userId),
    body: JSON.stringify({ name: name || '', enabled_skills: enabledSkills || [] }),
  })
  if (!response.ok) throw new Error('Failed to create conversation')
  return response.json()
}

export async function fetchConversation(
  userId: string,
  conversationId: string,
  cursor?: string,
  limit?: number,
): Promise<ConversationDetailResponse> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (limit) params.set('limit', String(limit))
  const qs = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}${qs}`), {
    headers: { 'X-User-Id': userId },
  })
  if (!response.ok) throw new Error('Failed to fetch conversation')
  return response.json()
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  data: { name?: string; enabled_skills?: number[]; enabled_files?: number[] },
): Promise<Conversation> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}`), {
    method: 'PUT',
    headers: authHeaders(userId),
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to update conversation')
  return response.json()
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}`), {
    method: 'DELETE',
    headers: { 'X-User-Id': userId },
  })
  if (!response.ok) throw new Error('Failed to delete conversation')
}

export async function saveMessages(
  userId: string,
  conversationId: string,
  messages: SaveMessagesRequest['messages'],
): Promise<SaveMessagesResponse> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers: authHeaders(userId),
    body: JSON.stringify({ messages }),
  })
  if (!response.ok) throw new Error('Failed to save messages')
  return response.json()
}

export async function publishConversation(
  userId: string,
  conversationId: string,
  apiDescription: string,
  publishType?: string,
  externalSystemPrompt?: string | null,
): Promise<PublishResponse> {
  const body: Record<string, unknown> = { apiDescription }
  if (publishType) {
    body.publishType = publishType
  }
  if (externalSystemPrompt !== undefined) {
    body.externalSystemPrompt = externalSystemPrompt
  }
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/publish`), {
    method: 'PUT',
    headers: authHeaders(userId),
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const bodyErr = await response.json().catch(() => ({}))
    throw new Error((bodyErr as any).error || 'Failed to publish conversation')
  }
  return response.json()
}

export async function fetchCallLogs(
  userId: string,
  conversationId: string,
  page = 1,
  size = 20,
): Promise<CallLogsResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/call-logs?${params}`), {
    headers: { 'X-User-Id': userId },
  })
  if (!response.ok) throw new Error('Failed to fetch call logs')
  return response.json()
}

export async function regenerateApiKey(
  userId: string,
  conversationId: string,
): Promise<ApiKeyResponse> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/regenerate-api-key`), {
    method: 'PUT',
    headers: authHeaders(userId),
  })
  if (!response.ok) throw new Error('Failed to regenerate API key')
  return response.json()
}

export async function fetchApiKey(
  userId: string,
  conversationId: string,
): Promise<ApiKeyResponse> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/api-key`), {
    headers: { 'X-User-Id': userId },
  })
  if (!response.ok) throw new Error('Failed to fetch API key')
  return response.json()
}

export async function updateApiDescription(
  userId: string,
  conversationId: string,
  apiDescription: string,
): Promise<{ conversation: import('../types/conversation').Conversation }> {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/api-description`), {
    method: 'PUT',
    headers: authHeaders(userId),
    body: JSON.stringify({ apiDescription }),
  })
  if (!response.ok) throw new Error('Failed to update API description')
  return response.json()
}

// --- Skill Usage Dashboard ---

export interface SkillUsageOverviewItem {
  toolName: string
  skillName: string
  totalCalls: number
  successCalls: number
  failCalls: number
  uniqueUsers: number
  createdBy: string
  createdByName?: string
  firstCallTime: string
  lastCallTime: string
  avgDurationMs: number
}

export async function fetchSkillUsageOverview(
  params: { startDate?: string; endDate?: string; keyword?: string } = {},
): Promise<SkillUsageOverviewItem[]> {
  const searchParams = new URLSearchParams()
  if (params.startDate) searchParams.set('startDate', params.startDate)
  if (params.endDate) searchParams.set('endDate', params.endDate)
  if (params.keyword) searchParams.set('keyword', params.keyword)
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const response = await fetch(apiUrl(`/api/skill-usage/overview${qs}`), {
    headers: { 'X-User-Id': localStorage.getItem('user_id') || '' },
  })
  if (!response.ok) throw new Error('Failed to fetch skill usage overview')
  return response.json()
}

export interface SkillUsageDetailPage {
  total: number
  page: number
  size: number
  records: SkillUsageDetailRecord[]
}

export interface SkillUsageDetailRecord {
  id: number
  userId: string
  userName?: string
  status: string
  startTime: string
  endTime: string
  durationMs: number
  errorMessage: string | null
}

export async function fetchSkillUsageDetails(
  skillName: string,
  page: number = 1,
  size: number = 20,
  startDate?: string,
  endDate?: string,
): Promise<SkillUsageDetailPage> {
  const params = new URLSearchParams({ skillName, page: String(page), size: String(size) })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const response = await fetch(apiUrl(`/api/skill-usage/details?${params}`), {
    headers: { 'X-User-Id': localStorage.getItem('user_id') || '' },
  })
  if (!response.ok) throw new Error('Failed to fetch skill usage details')
  return response.json()
}

// open spec: add-slash-skill-invocation
// 拉取 conversation 当前勾选的技能（id + name），用于前端 slash / hash picker。
// 返回空数组表示未勾选 / 出错（picker 自然隐藏）。
export interface ConversationEnabledSkill {
  id: number
  name: string
}

export async function fetchConversationEnabledSkills(
  conversationId: string,
): Promise<ConversationEnabledSkill[]> {
  if (!conversationId) return []
  try {
    const response = await fetch(apiUrl(`/api/skills/by-conversation?conversationId=${encodeURIComponent(conversationId)}`), {
      headers: { 'X-User-Id': localStorage.getItem('user_id') || '' },
    })
    if (!response.ok) {
      console.warn(`[SlashSkill] by-conversation returned ${response.status}`)
      return []
    }
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data
      .filter((s: any) => s && typeof s.id === 'number' && typeof s.name === 'string')
      .map((s: any) => ({ id: s.id, name: s.name }))
  } catch (e) {
    console.warn(`[SlashSkill] fetchConversationEnabledSkills failed: ${(e as Error)?.message || e}`)
    return []
  }
}

// --- Token Usage (add-conversation-token-usage-tab) ---

export interface TokenUsageOverview {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  // 估算 token 数（chars / 2），仅供参考
  totalPromptEstimatedTokens?: number
  totalCompletionEstimatedTokens?: number
  totalEstimatedTokens?: number
  totalCalls: number
  totalSessions: number
  failedCalls: number
}

export interface TokenUsageConversationSummary {
  sessionId: string
  conversationName: string | null
  userId: string
  startedAt: string | null
  endedAt: string | null
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalPromptEstimatedTokens?: number
  totalCompletionEstimatedTokens?: number
  totalEstimatedTokens?: number
  totalRounds: number
  totalToolRounds: number
  uniqueSkillsCount: number
  failedCalls: number
  status: 'SUCCESS' | 'FAILED'
}

export interface TokenUsageConversationPage {
  overview: TokenUsageOverview
  conversations: TokenUsageConversationSummary[]
  total: number
  page: number
  size: number
}

export interface TokenUsageCallDetail {
  traceId: string | null
  sessionId: string
  calledAt: string
  llmModel: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  promptEstimatedTokens?: number | null
  completionEstimatedTokens?: number | null
  estimatedTokens?: number | null
  roundIndex: number | null
  durationSeconds: number | null
  skillNames: string[]
  toolCallRounds: number | null
  isSuccess: boolean | null
  status: 'SUCCESS' | 'FAILED'
  finishReason: string | null
  errorMessage: string | null
}

export interface TokenUsageSessionDetail {
  sessionId: string
  conversationName: string
  calls: TokenUsageCallDetail[]
  totals: TokenUsageOverview
  uniqueSkillNames: string[]
}

export interface TokenUsageDailyPoint {
  date: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedTokens?: number
  promptEstimatedTokens?: number
  completionEstimatedTokens?: number
  callCount: number
  failedCount: number
}

export interface TokenUsageDailyResponse {
  points: TokenUsageDailyPoint[]
}

function buildUserIdHeaders(): HeadersInit {
  return { 'X-User-Id': localStorage.getItem('user_id') || '' }
}

export async function fetchTokenUsageConversations(
  userId: string,
  params: { startDate?: string; endDate?: string; page?: number; size?: number; keyword?: string } = {},
): Promise<TokenUsageConversationPage> {
  const sp = new URLSearchParams({ userId })
  if (params.startDate) sp.set('startDate', params.startDate)
  if (params.endDate) sp.set('endDate', params.endDate)
  if (params.keyword) sp.set('keyword', params.keyword)
  if (params.page) sp.set('page', String(params.page))
  if (params.size) sp.set('size', String(params.size))
  const res = await fetch(apiUrl(`/api/token-usage/conversations?${sp.toString()}`), {
    headers: buildUserIdHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch token usage conversations: ${res.status}`)
  return res.json()
}

export async function fetchTokenUsageSessionDetail(
  userId: string,
  sessionId: string,
): Promise<TokenUsageSessionDetail> {
  const res = await fetch(
    apiUrl(`/api/token-usage/conversations/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`),
    { headers: buildUserIdHeaders() },
  )
  if (!res.ok) throw new Error(`Failed to fetch session detail: ${res.status}`)
  return res.json()
}

export async function fetchTokenUsageDaily(
  userId: string,
  params: { startDate: string; endDate: string },
): Promise<TokenUsageDailyResponse> {
  const sp = new URLSearchParams({ userId, startDate: params.startDate, endDate: params.endDate })
  const res = await fetch(apiUrl(`/api/token-usage/daily?${sp.toString()}`), {
    headers: buildUserIdHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch token usage daily: ${res.status}`)
  return res.json()
}
