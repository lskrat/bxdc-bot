<script setup lang="ts">
// open spec: add-conversation-token-usage-tab
// d3-scale 自绘 SVG 堆叠柱状图：每日 prompt + completion tokens。
// 复用 tdesign-vue-next/chat 间接拉取的 d3-scale（无新依赖）。
import { computed } from 'vue'
import { scaleBand, scaleLinear } from 'd3-scale'
import type { TokenUsageDailyPoint } from '../services/api'

interface Props {
  points: TokenUsageDailyPoint[]
  unit?: 'token' | 'kilo' | 'mega'
}

const props = withDefaults(defineProps<Props>(), {
  unit: 'kilo',
})

const WIDTH = 820
const HEIGHT = 320
const MARGIN = { top: 16, right: 24, bottom: 48, left: 64 }
const INNER_W = WIDTH - MARGIN.left - MARGIN.right
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom

const divisor = computed(() => {
  if (props.unit === 'token') return 1
  if (props.unit === 'kilo') return 1000
  return 10000 // mega
})

const unitLabel = computed(() => {
  if (props.unit === 'token') return ''
  if (props.unit === 'kilo') return 'k'
  return 'w'
})

const xDomain = computed(() => props.points.map((p) => p.date))
const xScale = computed(() =>
  scaleBand<string>()
    .domain(xDomain.value)
    .range([0, INNER_W])
    .padding(0.25),
)

const maxTotal = computed(() => {
  if (props.points.length === 0) return 0
  // 同时看 chars 和 estimated tokens，取较大值
  return Math.max(
    ...props.points.map((p) =>
      Math.max(
        (p.promptTokens || 0) + (p.completionTokens || 0),
        (p.promptEstimatedTokens || 0) + (p.completionEstimatedTokens || 0),
      ),
    ),
    1,
  )
})

const yMax = computed(() => {
  const raw = maxTotal.value / divisor.value
  if (raw <= 0) return 1
  // 上取整到 1/2/5 * 10^n 让 tick 干净
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / pow
  let nice
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 5) nice = 5
  else nice = 10
  return nice * pow
})

const yScale = computed(() =>
  scaleLinear()
    .domain([0, yMax.value])
    .range([INNER_H, 0])
    .nice(),
)

const yTicks = computed(() => yScale.value.ticks(5))

function formatNum(n: number): string {
  const v = Number(n) || 0
  if (v >= 100000) return `${(v / 1000).toFixed(0)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

function formatFull(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US')
}

function shortDate(d: string): string {
  // '2026-07-08' -> '7/8'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const m = parts[1] ?? ''
  const day = parts[2] ?? ''
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`
}

function barHeight(v: number): number {
  if (!v || v <= 0) return 0
  return INNER_H - yScale.value(v / divisor.value)
}

function promptHeight(p: TokenUsageDailyPoint): number {
  return barHeight(p.promptTokens || 0)
}

function completionHeight(p: TokenUsageDailyPoint): number {
  return barHeight(p.completionTokens || 0)
}

function completionY(p: TokenUsageDailyPoint): number {
  // 堆叠柱状图：completion 在 prompt 上方
  // y 坐标 = INNER_H（底边） - prompt 高度 - completion 高度
  const promptPx = barHeight(p.promptTokens || 0)
  const completionPx = barHeight(p.completionTokens || 0)
  return INNER_H - promptPx - completionPx
}

function tooltipText(p: TokenUsageDailyPoint): string {
  const unitStr = props.unit === 'token' ? '' : props.unit === 'kilo' ? 'k' : 'w'
  const fmt = (n: number) => (n / divisor.value).toFixed(unitStr ? 2 : 0)
  return [
    `${p.date}`,
    `总 tokens: ${fmt(p.totalTokens || 0)}${unitStr}`,
    `prompt: ${fmt(p.promptTokens || 0)}${unitStr}`,
    `completion: ${fmt(p.completionTokens || 0)}${unitStr}`,
    `调用 ${p.callCount || 0} 次（失败 ${p.failedCount || 0}）`,
  ].join('\n')
}
</script>

<template>
  <div class="daily-chart">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet">
      <!-- Y 轴 -->
      <g class="y-axis" :transform="`translate(${MARGIN.left}, ${MARGIN.top})`">
        <line
          :x1="0"
          :y1="0"
          :x2="0"
          :y2="INNER_H"
          stroke="#e7e7e7"
          stroke-width="1"
        />
        <g
          v-for="(t, i) in yTicks"
          :key="`y-${i}`"
          :transform="`translate(0, ${yScale(t)})`"
        >
          <line :x1="-4" :y1="0" :x2="INNER_W" :y2="0" stroke="#f0f0f0" />
          <text :x="-8" :y="3" text-anchor="end" fill="#909399" font-size="11">
            {{ formatNum(t) }}{{ unitLabel }}
          </text>
        </g>
      </g>

      <!-- X 轴 -->
      <g class="x-axis" :transform="`translate(${MARGIN.left}, ${MARGIN.top + INNER_H})`">
        <line :x1="0" :y1="0" :x2="INNER_W" :y2="0" stroke="#e7e7e7" />
        <g
          v-for="(d, i) in xDomain"
          :key="`x-${i}`"
          :transform="`translate(${xScale(d) ?? 0}, 0)`"
        >
          <line :x1="0" :y1="0" :x2="0" :y2="4" stroke="#e7e7e7" />
          <text
            :x="(xScale.bandwidth() ?? 0) / 2"
            :y="18"
            text-anchor="middle"
            fill="#909399"
            font-size="10"
          >
            {{ shortDate(d) }}
          </text>
        </g>
      </g>

      <!-- 柱子 -->
      <g class="bars" :transform="`translate(${MARGIN.left}, ${MARGIN.top})`">
        <template v-for="(p, i) in points" :key="`bar-${i}`">
          <g :transform="`translate(${xScale(p.date) ?? 0}, 0)`">
            <!-- prompt 段（底部） -->
            <rect
              v-if="promptHeight(p) > 0"
              :x="0"
              :y="INNER_H - promptHeight(p)"
              :width="xScale.bandwidth() ?? 0"
              :height="promptHeight(p)"
              fill="#5B8FF9"
              fill-opacity="0.85"
              rx="2"
            >
              <title>{{ tooltipText(p) }}</title>
            </rect>
            <!-- completion 段（顶部） -->
            <rect
              v-if="completionHeight(p) > 0"
              :x="0"
              :y="completionY(p)"
              :width="xScale.bandwidth() ?? 0"
              :height="completionHeight(p)"
              fill="#5AD8A6"
              fill-opacity="0.9"
              rx="2"
            >
              <title>{{ tooltipText(p) }}</title>
            </rect>
            <!-- 失败次数小标记 -->
            <circle
              v-if="p.failedCount > 0"
              :cx="(xScale.bandwidth() ?? 0) / 2"
              :cy="-4"
              r="4"
              fill="#f56c6c"
              stroke="#fff"
              stroke-width="1"
            >
              <title>{{ p.failedCount }} 次失败</title>
            </circle>
          </g>
        </template>
      </g>
    </svg>

    <div class="legend">
      <span class="legend-item">
        <span class="legend-swatch" style="background: #5B8FF9"></span>
        prompt tokens
      </span>
      <span class="legend-item">
        <span class="legend-swatch" style="background: #5AD8A6"></span>
        completion tokens
      </span>
      <span class="legend-item">
        <span class="legend-swatch" style="background: #f56c6c; border-radius: 50%"></span>
        失败调用
      </span>
      <span class="legend-spacer"></span>
      <span class="legend-total">
        峰值 {{ formatFull(maxTotal) }} tokens（{{ unitLabel || 'token' }}）
      </span>
    </div>
  </div>
</template>

<style scoped>
.daily-chart {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

svg {
  width: 100%;
  height: auto;
  background: #fafbfc;
  border-radius: 6px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: #606266;
  padding: 0 8px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-swatch {
  display: inline-block;
  width: 14px;
  height: 10px;
  border-radius: 2px;
}

.legend-spacer {
  flex: 1;
}

.legend-total {
  color: #909399;
  font-size: 11px;
}
</style>