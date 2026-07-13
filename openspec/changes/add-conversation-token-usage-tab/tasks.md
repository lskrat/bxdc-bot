## 1. 后端 DTO

- [x] 1.1 新建 [TokenUsageOverviewDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageOverviewDTO.java)：字段 `totalPromptTokens / totalCompletionTokens / totalTokens / totalCalls / totalSessions / failedCalls(long)`
- [x] 1.2 新建 [TokenUsageConversationSummaryDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageConversationSummaryDTO.java)：字段 `sessionId / conversationName / startedAt / endedAt / totalPromptTokens / totalCompletionTokens / totalTokens / totalRounds / totalToolRounds / uniqueSkillsCount / failedCalls(long) / status(SUCCESS|FAILED)`
- [x] 1.3 新建 [TokenUsageCallDetailDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageCallDetailDTO.java)：字段 `traceId / calledAt / llmModel / promptTokens / completionTokens / totalTokens / roundIndex / durationSeconds / skillNames(List<String>) / toolCallRounds / isSuccess(boolean) / status(SUCCESS|FAILED) / finishReason / errorMessage(String)`
- [x] 1.4 新建 [TokenUsageSessionDetailDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageSessionDetailDTO.java)：字段 `sessionId / conversationName / calls(List<...>) / totals(...) / uniqueSkillNames`
- [x] 1.5 新建 [TokenUsageConversationPageDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageConversationPageDTO.java)：字段 `overview / conversations / total / page / size`
- [x] 1.6 新建 [TokenUsageDailyPointDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageDailyPointDTO.java)：字段 `date(LocalDate) / totalTokens / promptTokens / completionTokens / callCount(int) / failedCount(int)`
- [x] 1.7 新建 [TokenUsageDailyResponseDTO.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/dto/TokenUsageDailyResponseDTO.java)：字段 `points(List<TokenUsageDailyPointDTO>)`

## 2. 后端 mapper 扩展（@Select 注解以支持 GROUP BY + 失败计数 + 状态推断）

- [x] 2.1 [ConversationLogMapper.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/ConversationLogMapper.java) 加 `@Select` 注解方法：
  - `findSummariesByUserId(userId, startDate, endDate, offset, size, keyword)` —— GROUP BY session_id；**LEFT JOIN conversation 取 name**；含 `failed_calls`（`SUM(CASE WHEN is_success=0 THEN 1 ELSE 0 END)`）；状态 `MAX(CASE WHEN is_success=0 THEN 'FAILED' ELSE 'SUCCESS' END)`；按 endedAt DESC
  - `countSummariesByUserId(userId, startDate, endDate, keyword)` —— 同 WHERE 条件
  - `getOverviewByUserId(userId, startDate, endDate)` —— SUM + COUNT + failedCalls
  - `findCallDetailsBySessionIdDesc(userId, sessionId)` —— `ORDER BY created_at DESC LIMIT 1000`；**不按 is_success 过滤**；含 error_message
  - `findDailyByUserId(userId, startDate, endDate)` —— `GROUP BY DATE(created_at)`；含 failedCount
- [x] 2.2 [ToolCallLogMapper.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/ToolCallLogMapper.java) 加 `findDistinctSkillNamesBySessionIdAndTraceIds(sessionId, traceIds)`
- [x] 2.3 注意：MyBatis Plus default 方法不易写 GROUP BY 状态推断 + failed_count，**必须用 `@Select` 注解 + `<script>` + `<if>` 包裹 WHERE**（决策 10）

## 3. 后端 service

- [x] 3.1 新建 [TokenUsageService.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/TokenUsageService.java)：注入 ConversationLogMapper + ToolCallLogMapper
- [x] 3.2 `getConversationPage(userId, startDate, endDate, page, size, keyword)` —— 返回 `TokenUsageConversationPageDTO`
- [x] 3.3 `getSessionDetail(userId, sessionId)` —— 返回 `TokenUsageSessionDetailDTO`（calls 倒序，含失败）
- [x] 3.4 `getDaily(userId, startDate, endDate)` —— 返回 `TokenUsageDailyResponseDTO`（填充缺日为 0）
- [x] 3.5 单元测试：
  - 水平越权场景（userA 调 getSessionDetail(userA, userB 的 sessionId) 应返回空 calls）
  - 失败 round 在 detail 中正确返回 status=FAILED + error_message
  - 全部失败的 session 在 list 中正确返回 status=FAILED + failedCalls=N

## 4. 后端 controller

- [x] 4.1 新建 [TokenUsageController.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/TokenUsageController.java)：
  - `@RequestMapping("/api/token-usage")` + `@CrossOrigin(origins = "*")`
- [x] 4.2 `GET /conversations?userId=X&startDate=&endDate=&page=1&size=20&keyword=`：
  - 鉴权：`AamTokenUtil.requireUserId(request)` → `if (!headerUserId.equals(userId)) throw 403`
  - startDate / endDate 用 `@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)`
- [x] 4.3 `GET /conversations/{sessionId}?userId=X`：同上鉴权
- [x] 4.4 `GET /daily?userId=X&startDate=&endDate=`：同上鉴权
- [x] 4.5 [SecurityConfig.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SecurityConfig.java) 加白名单 `/api/token-usage/**`

## 5. 前端 composable

- [x] 5.1 新建 [useTokenUsage.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useTokenUsage.ts)：
  - 模块级 `const isTokenUsageVisible = ref(false)` + `const activeTab = ref<'overview'|'list'|'detail'>('overview')` + `const dateRange = ref<[string, string]>([今天-30天, 今天])` + `const chartUnit = ref<'token'|'kilo'|'mega'>('kilo')`
  - 导出 `{ isTokenUsageVisible, activeTab, dateRange, chartUnit, toggleTokenUsage, openTokenUsage, closeTokenUsage, setActiveTab, setDateRange, setChartUnit }`
  - 模式对齐 [useSkillHub.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useSkillHub.ts)

## 6. 前端 API client

- [x] 6.1 在 [frontend/src/api](file:///Users/dccb/botproject/fishtank/frontend/src/api) 或 [frontend/src/lib/api.ts](file:///Users/dccb/botproject/fishtank/frontend/src/lib/api.ts) 新增 3 个 fetch 函数：
  - `fetchTokenUsageConversations(userId, params)` 含 `startDate / endDate / page / size / keyword`
  - `fetchTokenUsageSessionDetail(userId, sessionId)`
  - `fetchTokenUsageDaily(userId, params)` 含 `startDate / endDate`

## 7. 前端图表组件（d3 自绘）

- [x] 7.1 新建 [TokenUsageDailyChart.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/TokenUsageDailyChart.vue)：`<script setup lang="ts">`
- [x] 7.2 props：`points: TokenUsageDailyPointDTO[]` + `unit: 'token' | 'kilo' | 'mega' = 'kilo'`
- [x] 7.3 import：`import { scaleBand, scaleLinear } from 'd3-scale'`
- [x] 7.4 内部 computed：`divisor`、`xScale`、`yScale`；**unit 切换时自动重算**
- [x] 7.5 模板：`<svg viewBox="0 0 800 320">` + `<rect>` 双段堆叠（prompt + completion）；hover `<title>` 显示 tooltip 含 failedCount
- [x] 7.6 **如果 `npm run build` 报 d3-scale not found**：`cd frontend && npm i d3-scale d3-shape` 加为直接依赖

## 8. 前端 modal 组件

- [x] 8.1 新建 [TokenUsagePanel.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/TokenUsagePanel.vue)：`<script setup lang="ts">`
- [x] 8.2 从 `useTokenUsage` 取 `{ isTokenUsageVisible, closeTokenUsage, activeTab, dateRange, chartUnit, setActiveTab, setDateRange, setChartUnit }`；从 `useUser` 取 `{ currentUser }`
- [x] 8.3 内部 ref：`overview / conversations / selectedSessionId / calls / dailyPoints / loading / error`
- [x] 8.4 `watch([isTokenUsageVisible, () => currentUser?.id], async ...)`：v=true 且 userId 存在 → 并行拉 overview + daily + list
- [x] 8.5 `watch([activeTab, dateRange], async ...)`：切 tab 触发对应查询；dateRange 变化触发所有 tab 重拉
- [x] 8.6 模板：`<t-dialog :visible="isTokenUsageVisible" header="Token 用量" width="880px" :footer="false" @close="closeTokenUsage">`
- [x] 8.7 顶部（跨 Tab）：`<t-date-range-picker v-model="dateRange" value-type="YYYY-MM-DD" :placeholder="['开始日期', '结束日期']" />`
- [x] 8.8 `<t-tabs :value="activeTab" @change="(v) => setActiveTab(v)">` 含 3 个 `<t-tab-panel>`：`overview` / `list` / `detail`
- [x] 8.9 overview tab：
  - **5 张概览卡片**（总 prompt / 总 completion / 总 tokens / 总调用次数 / 失败调用次数）—— 第 5 张 `theme="danger"` 当 failedCalls > 0
  - `<t-segmented v-model="chartUnit" :options="[{ label: 'token', value: 'token' }, { label: '千', value: 'kilo' }, { label: '万', value: 'mega' }]" />`
  - `<TokenUsageDailyChart :points="dailyPoints" :unit="chartUnit" />`
- [x] 8.10 list tab：
  - `<t-button @click="exportConversationsToCsv">导出 CSV</t-button>` 按钮（右上）
  - `<t-table :data="conversations" :columns="conversationColumns" :row-class-name="rowClassNameForFailed" @row-click="onRowClick">`
  - **conversationColumns 新增 `failedCalls` 列 + `status` 列（t-tag theme=danger for FAILED）**
  - **rowClassName 函数**：`(row) => row.status === 'FAILED' ? 'row-failed' : ''`
  - `<style scoped> .row-failed { background: #fff1f0 !important; } </style>`
- [x] 8.11 detail tab：
  - `<t-button @click="activeTab='list'">返回列表</t-button>`
  - `<t-table :data="calls" :columns="callDetailColumns" :row-class-name="rowClassNameForFailed">`
  - **callDetailColumns 新增 `status` 列（t-tag theme=danger for FAILED）+ `errorMessage` 列（截断 200 字 + ellipsis）**
- [x] 8.12 `exportConversationsToCsv()` 函数（用 `escapeCsvCell` 处理 CSV 转义）
- [x] 8.13 防御性：`v-if="!currentUser"` "请先登录"；`v-else-if="loading"` loading；错误 t-alert

## 9. 修改 Layout.vue

- [x] 9.1 [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue) script 顶部 import：`import TokenUsagePanel from './TokenUsagePanel.vue'` + `import { useTokenUsage } from '../composables/useTokenUsage'`
- [x] 9.2 在 `useSkillHub` 解构旁加 `const { toggleTokenUsage } = useTokenUsage()`
- [x] 9.3 顶栏 t-button 新增（在「运营看板」按钮旁）：
  ```html
  <t-button v-if="currentUser" theme="default" variant="text" @click="toggleTokenUsage">
    <template #icon><ChartIcon /></template>
    Token 用量
  </t-button>
  ```
- [x] 9.4 模板底部（`<SkillHub />` / `<LlmSettingsModal />` 同位）新增 `<TokenUsagePanel />`

## 10. DB 索引（性能）

- [x] 10.1 [SchemaMigrationRunner.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java) 加幂等迁移：
  ```sql
  CREATE INDEX idx_conv_logs_user_updated ON conversation_logs (user_id, updated_at DESC);
  CREATE INDEX idx_conv_logs_session_created ON conversation_logs (session_id, created_at ASC);
  CREATE INDEX idx_conv_logs_user_created ON conversation_logs (user_id, created_at);
  CREATE INDEX idx_tool_call_logs_session ON tool_call_logs (session_id, trace_id);
  ```
- [x] 10.2 用 `ensureIndex` 模式（幂等，已存在则跳过）

## 11. 验证

- [x] 11.1 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml compile -DskipTests` exit 0
- [x] 11.2 `cd frontend && npx vue-tsc -b` exit 0 且无输出
- [x] 11.3 `cd frontend && npm run build` exit 0
- [x] 11.4 浏览器手动验收：
  - 登录用户 A → 顶栏点「Token 用量」→ 弹窗默认「概览」Tab
  - 5 张卡片显示数字（最后一张是失败次数）
  - 柱状图渲染每日用量
  - 日期选择器默认近 30 天；改日期 → 所有数据刷新
  - 切到「会话列表」Tab → 显示 A 的所有有 LLM 调用的会话（按 endedAt DESC）
  - 失败/部分失败的会话**标红 + 状态列 t-tag danger**
  - 点某行 → 切到「详情」Tab → 显示每轮 LLM 调用（**最新在最前**），含 skill 名
  - 失败的 round **标红 + 显示 errorMessage**
  - 点「导出 CSV」→ 下载文件，含失败行 + 失败次数列 + 状态列
  - 关闭弹窗 → 聊天上下文未丢失
  - 切到用户 B → 重开「Token 用量」→ 只看到 B 的数据
  - 用 curl 模拟越权 → 403
- [x] 11.5 跑一次 mvn 单测覆盖水平越权 + 失败 round 场景

## 12. 边界场景

- [x] 12.1 旧 conversation_logs 行 prompt_tokens=NULL → SUM 自动跳过，前端数字列显示 "—"
- [x] 12.2 conversation 行被删 → LEFT JOIN 返回 name=null → 前端 fallback 显示 sessionId 前 8 位
- [x] 12.3 用户在弹窗打开时切换 user → 旧 user 数据不污染新 user 数据
- [x] 12.4 全部失败的会话 → status=FAILED，但 totalTokens=0；CSV 仍导出该行
- [x] 12.5 详情 round 失败时 skillNames 为空数组 → UI 显示 "—"
- [x] 12.6 error_message 含换行 → 前端 truncate 200 字 + ellipsis；CSV 中 escapeCsvCell 加引号包裹
- [x] 12.7 一次会话连续 100+ 失败 round（极端场景）→ list 显示 failedCalls=100+，颜色标红，CSV 正确导出
- [x] 12.8 用户在概览 tab 切 chartUnit → 列表和详情不受影响（chartUnit 是 overview tab 私有 state，但放到 composable 共享以便重渲染）