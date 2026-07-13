<script setup lang="ts">
// open spec: add-conversation-token-usage-tab
// 顶部按钮触发的弹窗：3 Tab（概览 / 列表 / 详情）+ 日期范围 + 失败标红 + CSV 导出。
import { ref, watch, computed, nextTick } from 'vue'
import { useTokenUsage } from '../composables/useTokenUsage'
import { useUser } from '../composables/useUser'
import {
  fetchTokenUsageConversations,
  fetchTokenUsageSessionDetail,
  fetchTokenUsageDaily,
  type TokenUsageConversationSummary,
  type TokenUsageCallDetail,
  type TokenUsageOverview,
} from '../services/api'
import TokenUsageDailyChart from './TokenUsageDailyChart.vue'
import { DownloadIcon } from 'tdesign-icons-vue-next'

const {
  isTokenUsageVisible,
  activeTab,
  dateRange,
  chartUnit,
  closeTokenUsage,
  setActiveTab,
  setDateRange,
  setChartUnit,
} = useTokenUsage()

const { currentUser } = useUser()

// 状态
const loading = ref(false)
const errorMsg = ref('')
const overview = ref<TokenUsageOverview>({
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalCalls: 0,
  totalSessions: 0,
  failedCalls: 0,
})
const conversations = ref<TokenUsageConversationSummary[]>([])
const selectedSessionId = ref<string>('')
const calls = ref<TokenUsageCallDetail[]>([])
const sessionDetailLoading = ref(false)

// 概览数据
const dailyPoints = ref<import('../services/api').TokenUsageDailyPoint[]>([])

// ---- 数据加载 ----

async function loadOverviewData() {
  if (!currentUser.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const userId = String(currentUser.value.id)
    const [page, daily] = await Promise.all([
      fetchTokenUsageConversations(userId, {
        startDate: dateRange.value[0],
        endDate: dateRange.value[1],
        page: 1,
        size: 50,
      }),
      fetchTokenUsageDaily(userId, {
        startDate: dateRange.value[0],
        endDate: dateRange.value[1],
      }),
    ])
    overview.value = page.overview
    conversations.value = page.conversations
    dailyPoints.value = daily.points
  } catch (e: any) {
    errorMsg.value = e?.message || '加载失败'
    console.error('[TokenUsage] loadOverviewData failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadConversationList() {
  if (!currentUser.value) return
  loading.value = true
  try {
    const userId = String(currentUser.value.id)
    const page = await fetchTokenUsageConversations(userId, {
      startDate: dateRange.value[0],
      endDate: dateRange.value[1],
      page: 1,
      size: 50,
    })
    overview.value = page.overview
    conversations.value = page.conversations
  } catch (e: any) {
    errorMsg.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadSessionDetail(sessionId: string) {
  if (!currentUser.value || !sessionId) return
  sessionDetailLoading.value = true
  try {
    const userId = String(currentUser.value.id)
    const detail = await fetchTokenUsageSessionDetail(userId, sessionId)
    calls.value = detail.calls
  } catch (e: any) {
    errorMsg.value = e?.message || '加载详情失败'
  } finally {
    sessionDetailLoading.value = false
  }
}

// ---- Watchers ----

// 弹窗打开 或 切换用户 → 加载
watch(
  [isTokenUsageVisible, () => currentUser.value?.id],
  async ([v, userId]) => {
    if (v && userId) {
      await loadOverviewData()
    }
  },
  { immediate: true },
)

// 日期范围变化 → 重拉（所有 Tab）
watch(
  () => [...dateRange.value],
  async () => {
    if (!isTokenUsageVisible.value || !currentUser.value) return
    await loadOverviewData()
  },
)

// ---- Tab 切换 ----

async function switchTab(tab: 'overview' | 'list' | 'detail') {
  setActiveTab(tab)
  if (tab === 'list' && conversations.value.length === 0) {
    await loadConversationList()
  }
  if (tab === 'detail' && selectedSessionId.value && calls.value.length === 0) {
    await loadSessionDetail(selectedSessionId.value)
  }
}

// ---- 行点击 → 进详情 ----

async function onRowClick(ctx: { row: TokenUsageConversationSummary }) {
  selectedSessionId.value = ctx.row.sessionId
  calls.value = []
  setActiveTab('detail')
  await nextTick()
  await loadSessionDetail(ctx.row.sessionId)
}

// 返回列表
function backToList() {
  setActiveTab('list')
}

// ---- 表格列定义 ----

const conversationColumns = computed(() => [
  {
    colKey: 'conversationName',
    title: '会话',
    width: 200,
    ellipsis: true,
  },
  {
    colKey: 'timeRange',
    title: '起止时间',
    width: 220,
  },
  {
    colKey: 'totalRounds',
    title: '轮次',
    width: 60,
    align: 'right' as const,
  },
  {
    colKey: 'totalTokens',
    title: '总 tokens',
    width: 100,
    align: 'right' as const,
  },
  {
    colKey: 'split',
    title: 'prompt / completion',
    width: 180,
  },
  {
    colKey: 'uniqueSkillsCount',
    title: 'skills',
    width: 60,
    align: 'right' as const,
  },
  {
    colKey: 'failedCalls',
    title: '失败',
    width: 60,
    align: 'right' as const,
  },
  {
    colKey: 'status',
    title: '状态',
    width: 80,
    align: 'center' as const,
  },
])

function renderConversationName(c: TokenUsageConversationSummary): string {
  if (c.conversationName && c.conversationName.trim() !== '') return c.conversationName
  return c.sessionId.slice(0, 8) + '...'
}

function rowClassNameForFailed(ctx: { row: TokenUsageConversationSummary }): string {
  return ctx.row.status === 'FAILED' ? 'row-failed' : ''
}

const callDetailColumns = computed(() => [
  {
    colKey: 'calledAt',
    title: '时间',
    width: 160,
  },
  {
    colKey: 'llmModel',
    title: '模型',
    width: 120,
    ellipsis: true,
  },
  {
    colKey: 'promptTokens',
    title: 'prompt',
    width: 90,
    align: 'right' as const,
  },
  {
    colKey: 'completionTokens',
    title: 'completion',
    width: 110,
    align: 'right' as const,
  },
  {
    colKey: 'totalTokens',
    title: 'total',
    width: 90,
    align: 'right' as const,
  },
  {
    colKey: 'skillNames',
    title: 'skills',
    width: 160,
    ellipsis: true,
  },
  {
    colKey: 'durationSeconds',
    title: '耗时',
    width: 70,
    align: 'right' as const,
  },
  {
    colKey: 'status',
    title: '状态',
    width: 80,
    align: 'center' as const,
  },
  {
    colKey: 'errorMessage',
    title: '错误信息',
    ellipsis: true,
  },
])

function renderCalledAt(c: TokenUsageCallDetail): string {
  return c.calledAt ? c.calledAt.slice(0, 19).replace('T', ' ') : '-'
}

function renderNum(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString()
}

function renderSkillNames(c: TokenUsageCallDetail): string {
  if (!c.skillNames || c.skillNames.length === 0) return '—'
  return c.skillNames.join(', ')
}

function renderDuration(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(2)}s`
}

function renderErrorMessage(msg: string | null | undefined): string {
  if (!msg) return ''
  return msg.length > 200 ? msg.slice(0, 200) + '...' : msg
}

function callRowClassName(ctx: { row: TokenUsageCallDetail }): string {
  return ctx.row.status === 'FAILED' ? 'row-failed' : ''
}

// ---- CSV 导出 ----

function escapeCsvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function exportConversationsToCsv() {
  const headers = [
    '会话标题',
    'sessionId',
    '开始时间',
    '结束时间',
    '轮次',
    '总tokens',
    'prompt tokens',
    'completion tokens',
    'skill数',
    '失败次数',
    '状态',
  ]
  const rows = conversations.value.map((c) => [
    renderConversationName(c),
    c.sessionId,
    c.startedAt ?? '',
    c.endedAt ?? '',
    c.totalRounds,
    c.totalTokens,
    c.totalPromptTokens,
    c.totalCompletionTokens,
    c.uniqueSkillsCount,
    c.failedCalls,
    c.status,
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map(escapeCsvCell).join(','))
    .join('\n')
  // BOM 防 Excel 乱码
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const today = new Date().toISOString().slice(0, 10)
  a.download = `token-usage-${currentUser.value?.id ?? 'unknown'}-${today}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---- 日期范围处理 ----

const dateRangeValue = computed<[string, string]>({
  get: () => dateRange.value,
  set: (v) => setDateRange(v),
})

// 工具
function fmtBigNum(n: number | undefined): string {
  return (n || 0).toLocaleString()
}
</script>

<template>
  <t-dialog
    :visible="isTokenUsageVisible"
    header="Token 用量统计"
    width="880"
    :footer="false"
    :on-close="closeTokenUsage"
    :on-confirm="closeTokenUsage"
    @close="closeTokenUsage"
  >
    <!-- 顶部日期范围选择器（跨 Tab 联动） -->
    <div class="token-usage-toolbar">
      <t-date-range-picker
        v-model="dateRangeValue"
        value-type="YYYY-MM-DD"
        :placeholder="['开始日期', '结束日期']"
        clearable
      />
      <div class="toolbar-hint">
        <span v-if="currentUser">用户 ID：{{ currentUser.id }}</span>
        <span v-else>未登录</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <t-alert v-if="errorMsg" theme="error" :message="errorMsg" style="margin-bottom: 12px" />

    <!-- Tab 切换 -->
    <t-tabs :value="activeTab" @change="(v: any) => switchTab(v as any)">
      <!-- ========== 概览 Tab ========== -->
      <t-tab-panel value="overview" label="概览">
        <div v-if="loading && overview.totalCalls === 0" class="loading-block">加载中…</div>
        <template v-else>
          <!-- 5 张概览卡片 -->
          <div class="overview-cards">
            <div class="metric-card">
              <div class="metric-label">总 prompt 字符</div>
              <div class="metric-value">{{ fmtBigNum(overview.totalPromptTokens) }}</div>
              <div class="metric-sub">≈ 估算 token {{ fmtBigNum(overview.totalPromptEstimatedTokens || 0) }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">总 completion 字符</div>
              <div class="metric-value">{{ fmtBigNum(overview.totalCompletionTokens) }}</div>
              <div class="metric-sub">≈ 估算 token {{ fmtBigNum(overview.totalCompletionEstimatedTokens || 0) }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">总字符</div>
              <div class="metric-value primary">{{ fmtBigNum(overview.totalTokens) }}</div>
              <div class="metric-sub">≈ 估算 token {{ fmtBigNum(overview.totalEstimatedTokens || 0) }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">总调用次数</div>
              <div class="metric-value">{{ fmtBigNum(overview.totalCalls) }}</div>
              <div class="metric-sub">会话数 {{ fmtBigNum(overview.totalSessions) }}</div>
            </div>
            <div
              class="metric-card"
              :class="{ 'metric-danger': (overview.failedCalls || 0) > 0 }"
            >
              <div class="metric-label">失败调用次数</div>
              <div
                class="metric-value"
                :class="{ 'danger': (overview.failedCalls || 0) > 0 }"
              >
                {{ fmtBigNum(overview.failedCalls) }}
              </div>
            </div>
          </div>

          <!-- 图表 + 单位切换 -->
          <div class="chart-header">
            <div class="chart-title">每日用量趋势（字符 / 估算 token 切换）</div>
            <t-segmented
              :value="chartUnit"
              :options="[
                { label: 'token', value: 'token' },
                { label: '千 (k)', value: 'kilo' },
                { label: '万 (w)', value: 'mega' },
              ]"
              @change="(v: any) => setChartUnit(v as any)"
            />
          </div>
          <TokenUsageDailyChart :points="dailyPoints" :unit="chartUnit" />
        </template>
      </t-tab-panel>

      <!-- ========== 列表 Tab ========== -->
      <t-tab-panel value="list" label="会话列表">
        <div class="list-toolbar">
          <t-button @click="exportConversationsToCsv" theme="primary" variant="outline">
            <template #icon><DownloadIcon /></template>
            导出 CSV
          </t-button>
          <span class="list-count">共 {{ conversations.length }} 条</span>
        </div>
        <div v-if="loading" class="loading-block">加载中…</div>
        <t-table
          v-else
          :data="conversations"
          :columns="conversationColumns"
          :row-class-name="rowClassNameForFailed"
          :hover="true"
          :pagination="{
            total: conversations.length,
            pageSize: 20,
            showJumper: true,
          }"
          stripe
          row-key="sessionId"
          @row-click="onRowClick"
        >
          <template #conversationName="{ row }">
            <span :title="row.sessionId">{{ renderConversationName(row) }}</span>
          </template>
          <template #timeRange="{ row }">
            <div class="time-range">
              <div>{{ row.startedAt ? row.startedAt.slice(0, 16).replace('T', ' ') : '-' }}</div>
              <div class="time-range-end">{{ row.endedAt ? row.endedAt.slice(0, 16).replace('T', ' ') : '-' }}</div>
            </div>
          </template>
          <template #totalTokens="{ row }">
            <span class="num-strong">{{ fmtBigNum(row.totalTokens) }}</span>
          </template>
          <template #split="{ row }">
            <span class="num-soft">{{ fmtBigNum(row.totalPromptTokens) }} / {{ fmtBigNum(row.totalCompletionTokens) }}</span>
          </template>
          <template #failedCalls="{ row }">
            <span :class="{ 'danger': (row.failedCalls || 0) > 0 }">
              {{ row.failedCalls || 0 }}
            </span>
          </template>
          <template #status="{ row }">
            <t-tag
              v-if="row.status === 'FAILED'"
              theme="danger"
              variant="light"
              size="small"
            >FAILED</t-tag>
            <t-tag v-else theme="success" variant="light" size="small">SUCCESS</t-tag>
          </template>
        </t-table>
      </t-tab-panel>

      <!-- ========== 详情 Tab ========== -->
      <t-tab-panel value="detail" label="会话详情">
        <div class="detail-header">
          <t-button @click="backToList" variant="text">← 返回列表</t-button>
          <span class="detail-session-id">session: {{ selectedSessionId }}</span>
          <span class="detail-call-count">共 {{ calls.length }} 条</span>
        </div>
        <div v-if="sessionDetailLoading" class="loading-block">加载中…</div>
        <t-table
          v-else
          :data="calls"
          :columns="callDetailColumns"
          :row-class-name="callRowClassName"
          :hover="true"
          :pagination="{
            total: calls.length,
            pageSize: 20,
            showJumper: true,
          }"
          stripe
          row-key="traceId"
        >
          <template #calledAt="{ row }">
            <span>{{ renderCalledAt(row) }}</span>
          </template>
          <template #llmModel="{ row }">
            <span :title="row.llmModel || ''">{{ row.llmModel || '—' }}</span>
          </template>
          <template #promptTokens="{ row }">
            <span :class="{ 'num-soft': row.status === 'FAILED' }">
              {{ row.status === 'FAILED' ? '—' : renderNum(row.promptTokens) }}
            </span>
          </template>
          <template #completionTokens="{ row }">
            <span :class="{ 'num-soft': row.status === 'FAILED' }">
              {{ row.status === 'FAILED' ? '—' : renderNum(row.completionTokens) }}
            </span>
          </template>
          <template #totalTokens="{ row }">
            <span :class="{ 'num-soft': row.status === 'FAILED' }">
              {{ row.status === 'FAILED' ? '—' : renderNum(row.totalTokens) }}
            </span>
          </template>
          <template #skillNames="{ row }">
            <span class="skill-names">{{ renderSkillNames(row) }}</span>
          </template>
          <template #durationSeconds="{ row }">
            <span>{{ renderDuration(row.durationSeconds) }}</span>
          </template>
          <template #status="{ row }">
            <t-tag
              v-if="row.status === 'FAILED'"
              theme="danger"
              variant="light"
              size="small"
            >FAILED</t-tag>
            <t-tag v-else theme="success" variant="light" size="small">SUCCESS</t-tag>
          </template>
          <template #errorMessage="{ row }">
            <span class="error-message">{{ renderErrorMessage(row.errorMessage) }}</span>
          </template>
        </t-table>
      </t-tab-panel>
    </t-tabs>
  </t-dialog>
</template>

<style scoped>
.token-usage-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.toolbar-hint {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.metric-card {
  padding: 14px 16px;
  background: #f7f8fa;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  transition: all 0.15s;
}

.metric-card:hover {
  border-color: #c0c4cc;
  background: #f0f2f5;
}

.metric-card.metric-danger {
  background: #fef0f0;
  border-color: #fbc4c4;
}

.metric-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}

.metric-value.primary {
  color: #5B8FF9;
}

.metric-value.danger {
  color: #f56c6c;
}

.metric-sub {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.list-count {
  font-size: 12px;
  color: #909399;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-session-id {
  font-family: monospace;
  font-size: 12px;
  color: #606266;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-call-count {
  font-size: 12px;
  color: #909399;
}

.time-range {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #606266;
}

.time-range-end {
  color: #909399;
  font-size: 11px;
}

.num-strong {
  font-weight: 600;
  color: #303133;
}

.num-soft {
  color: #909399;
  font-style: italic;
}

.danger {
  color: #f56c6c;
  font-weight: 600;
}

.skill-names {
  font-family: monospace;
  font-size: 12px;
  color: #5B8FF9;
}

.error-message {
  color: #f56c6c;
  font-size: 12px;
  font-family: monospace;
}

.loading-block {
  padding: 40px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

/* 失败行标红 */
:deep(.row-failed) {
  background: #fef0f0 !important;
}

:deep(.row-failed:hover) {
  background: #fde2e2 !important;
}

:deep(.row-failed td) {
  background: inherit !important;
}
</style>