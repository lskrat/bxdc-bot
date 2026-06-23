<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchSkillUsageOverview, fetchSkillUsageDetails, type SkillUsageOverviewItem, type SkillUsageDetailRecord } from '../services/api'

// Filters
const keyword = ref('')
const startDate = ref('')
const endDate = ref('')

// Overview table
const overviewData = ref<SkillUsageOverviewItem[]>([])
const overviewLoading = ref(false)
const overviewPage = ref(1)
const overviewPageSize = ref(20)

// Detail dialog
const detailVisible = ref(false)
const detailSkillName = ref('')
const detailRecords = ref<SkillUsageDetailRecord[]>([])
const detailLoading = ref(false)
const detailTotal = ref(0)
const detailPage = ref(1)
const detailPageSize = ref(20)

const overviewColumns = [
  { colKey: 'skillName', title: 'Skill名称', width: 180 },
  { colKey: 'toolName', title: '类型', width: 120 },
  { colKey: 'totalCalls', title: '调用次数', width: 100, align: 'right' as const, sorter: true },
  { colKey: 'successRate', title: '成功率', width: 100, cell: 'successRate', sorter: true },
  { colKey: 'uniqueUsers', title: '调用用户数', width: 100, align: 'right' as const, sorter: true },
  { colKey: 'avgDurationMs', title: '平均耗时(ms)', width: 120, align: 'right' as const, sorter: true },
  { colKey: 'createdBy', title: '创建者', width: 120, cell: 'createdBy' },
  { colKey: 'firstCallTime', title: '首次调用', width: 160, sorter: true },
  { colKey: 'lastCallTime', title: '最近调用', width: 160, sorter: true },
  { colKey: 'actions', title: '操作', width: 100, cell: 'actions' },
]

const detailColumns = [
  { colKey: 'userId', title: '调用用户', width: 150, cell: 'userId' },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'startTime', title: '开始时间', width: 160 },
  { colKey: 'durationMs', title: '耗时(ms)', width: 100, align: 'right' as const },
  { colKey: 'errorMessage', title: '错误信息', width: 200 },
]

function successRate(row: SkillUsageOverviewItem): string {
  if (row.totalCalls === 0) return '0%'
  return ((row.successCalls / row.totalCalls) * 100).toFixed(1) + '%'
}

function successRateColor(row: SkillUsageOverviewItem): string {
  const rate = row.totalCalls === 0 ? 0 : row.successCalls / row.totalCalls
  if (rate > 0.9) return 'var(--td-success-color)'
  if (rate < 0.5) return 'var(--td-error-color)'
  return 'var(--td-text-color-primary)'
}

// 列排序（前端本地排序，基于已加载的全量数据）
type SortInfo = { sortBy: string; descending: boolean }
const sort = ref<SortInfo | undefined>(undefined)

const sortedData = computed<SkillUsageOverviewItem[]>(() => {
  const s = sort.value
  if (!s || !s.sortBy) return overviewData.value
  const dir = s.descending ? -1 : 1
  const sortBy = s.sortBy
  return [...overviewData.value].sort((a, b) => {
    let av: number
    let bv: number
    if (sortBy === 'successRate') {
      av = a.totalCalls === 0 ? 0 : a.successCalls / a.totalCalls
      bv = b.totalCalls === 0 ? 0 : b.successCalls / b.totalCalls
    } else if (sortBy === 'firstCallTime' || sortBy === 'lastCallTime') {
      av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0
      bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0
    } else {
      av = Number((a as Record<string, unknown>)[sortBy] ?? 0)
      bv = Number((b as Record<string, unknown>)[sortBy] ?? 0)
    }
    return (av - bv) * dir
  })
})

function onSortChange(value: SortInfo | undefined) {
  sort.value = value && value.sortBy ? value : undefined
  overviewPage.value = 1
}

async function loadOverview() {
  overviewLoading.value = true
  try {
    overviewData.value = await fetchSkillUsageOverview({
      keyword: keyword.value || undefined,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
    })
    overviewPage.value = 1
  } finally {
    overviewLoading.value = false
  }
}

async function showDetails(row: SkillUsageOverviewItem) {
  detailSkillName.value = row.skillName
  detailPage.value = 1
  detailVisible.value = true
  await loadDetails()
}

async function loadDetails() {
  detailLoading.value = true
  try {
    const result = await fetchSkillUsageDetails(
      detailSkillName.value,
      detailPage.value,
      detailPageSize.value,
    )
    detailTotal.value = result.total
    detailRecords.value = result.records
  } finally {
    detailLoading.value = false
  }
}

function onDetailPageChange(pageInfo: { current: number }) {
  detailPage.value = pageInfo.current
  loadDetails()
}

onMounted(() => {
  loadOverview()
})
</script>

<template>
  <div class="skill-usage-dashboard">
    <h2 class="page-title">运营看板 — Skill 使用统计</h2>

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="filter-row">
        <t-date-picker
          v-model="startDate"
          placeholder="开始日期"
          clearable
          style="width: 160px"
        />
        <span class="filter-sep">—</span>
        <t-date-picker
          v-model="endDate"
          placeholder="结束日期"
          clearable
          style="width: 160px"
        />
        <t-input
          v-model="keyword"
          placeholder="搜索 Skill 名称"
          clearable
          style="width: 220px"
          @enter="loadOverview"
        />
        <t-button theme="primary" @click="loadOverview">查询</t-button>
      </div>
    </div>

    <!-- Overview table -->
    <t-table
      :data="sortedData"
      :columns="overviewColumns"
      :loading="overviewLoading"
      :sort="sort"
      :pagination="{
        current: overviewPage,
        pageSize: overviewPageSize,
        total: overviewData.length,
        showJumper: true,
      }"
      row-key="skillName"
      hover
      stripe
      @sort-change="onSortChange"
      @page-change="(pi: { current: number }) => overviewPage = pi.current"
    >
      <template #successRate="{ row }">
        <span :style="{ color: successRateColor(row), fontWeight: 600 }">
          {{ successRate(row) }}
        </span>
      </template>
      <template #createdBy="{ row }">
        {{ row.createdByName || row.createdBy }}
      </template>
      <template #actions="{ row }">
        <t-button
          theme="primary"
          variant="text"
          size="small"
          @click="showDetails(row)"
        >
          调用详情
        </t-button>
      </template>
    </t-table>

    <!-- Detail dialog -->
    <t-dialog
      v-model:visible="detailVisible"
      :header="`${detailSkillName} — 调用详情`"
      width="800px"
      :footer="false"
    >
      <t-table
        :data="detailRecords"
        :columns="detailColumns"
        :loading="detailLoading"
        :pagination="{
          current: detailPage,
          pageSize: detailPageSize,
          total: detailTotal,
          showJumper: true,
        }"
        row-key="id"
        hover
        @page-change="onDetailPageChange"
      >
        <template #userId="{ row }">
          {{ row.userName || row.userId }}
        </template>
        <template #status="{ row }">
          <t-tag
            :theme="row.status === 'completed' ? 'success' : 'danger'"
            variant="light"
            size="small"
          >
            {{ row.status === 'completed' ? '成功' : '失败' }}
          </t-tag>
        </template>
      </t-table>
    </t-dialog>
  </div>
</template>

<style scoped>
.skill-usage-dashboard {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: var(--td-text-color-primary);
}

.filter-bar {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--td-bg-color-container);
  border-radius: 8px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-sep {
  color: var(--td-text-color-placeholder);
}
</style>
