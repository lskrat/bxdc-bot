import { ref } from 'vue'

// open spec: add-conversation-token-usage-tab
// 模块级 singleton ref + toggle / open / close / setActiveTab / setDateRange / setChartUnit
// 对齐 useSkillHub / useLlmSettings / useServerLedger 模式。
// 由 Layout.vue 顶栏按钮调用，弹窗组件读 isTokenUsageVisible 决定显示。

export type TokenUsageTab = 'overview' | 'list' | 'detail'
export type TokenUsageUnit = 'token' | 'kilo' | 'mega'

const isTokenUsageVisible = ref(false)
const activeTab = ref<TokenUsageTab>('overview')
const dateRange = ref<[string, string]>([
  (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return formatYmd(d)
  })(),
  formatYmd(new Date()),
])
const chartUnit = ref<TokenUsageUnit>('kilo')

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useTokenUsage() {
  function toggleTokenUsage() {
    isTokenUsageVisible.value = !isTokenUsageVisible.value
  }

  function openTokenUsage() {
    isTokenUsageVisible.value = true
  }

  function closeTokenUsage() {
    isTokenUsageVisible.value = false
  }

  function setActiveTab(tab: TokenUsageTab) {
    activeTab.value = tab
  }

  function setDateRange(range: [string, string]) {
    dateRange.value = range
  }

  function setChartUnit(unit: TokenUsageUnit) {
    chartUnit.value = unit
  }

  return {
    isTokenUsageVisible,
    activeTab,
    dateRange,
    chartUnit,
    toggleTokenUsage,
    openTokenUsage,
    closeTokenUsage,
    setActiveTab,
    setDateRange,
    setChartUnit,
  }
}