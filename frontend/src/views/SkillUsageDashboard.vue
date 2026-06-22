<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  { colKey: 'totalCalls', title: '调用次数', width: 100, align: 'right' as const },
  { colKey: 'successRate', title: '成功率', width: 100, cell: 'successRate' },
  { colKey: 'uniqueUsers', title: '调用用户数', width: 100, align: 'right' as const },
  { colKey: 'createdBy', title: '创建者', width: 120 },
  { colKey: 'firstCallTime', title: '首次调用', width: 160 },
  { colKey: 'lastCallTime', title: '最近调用', width: 160 },
  { colKey: 'actions', title: '操作', width: 100, cell: 'actions' },
]

const detailColumns = [
  { colKey: 'userId', title: '调用用户', width: 150 },
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
      :data="overviewData"
      :columns="overviewColumns"
      :loading="overviewLoading"
      :pagination="{
        current: overviewPage,
        pageSize: overviewPageSize,
        total: overviewData.length,
        showJumper: true,
      }"
      row-key="skillName"
      hover
      stripe
      @page-change="(pi: { current: number }) => overviewPage = pi.current"
    >
      <template #successRate="{ row }">
        <span :style="{ color: successRateColor(row), fontWeight: 600 }">
          {{ successRate(row) }}
        </span>
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
