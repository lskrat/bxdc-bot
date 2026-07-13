# Design: 按用户维度的 LLM Token 用量 + 技能调用统计 Tab

## Context

**已有数据**（agent-core 已经在写库，本次不动 agent-core）：
- [ConversationLog.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/ConversationLog.java) 对应表 `conversation_logs`：每条记录是一次**主 Agent 完成的一次 LLM round**（含 prompt/completion/total tokens、llm_model、llm_rounds、tool_call_rounds、is_success、finish_reason、duration、skill_name、tool_name、user_id、session_id、created_at、**error_message**）
- [ToolCallLog.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/ToolCallLog.java) 对应表 `tool_call_logs`：每条记录是**一次 skill/tool 调用**（含 llm_input_tokens / llm_output_tokens、duration_ms、skill_name、status、user_id、session_id）

**已有前端组件**（本次对齐模式）：
- [SkillHub.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/SkillHub.vue) —— 顶栏按钮触发弹窗，弹窗内 `t-tabs + t-tab-panel` 多 tab
- [useSkillHub.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useSkillHub.ts) —— 模块级 `const isVisible = ref(false)` + `toggle / open / close`
- [LlmSettingsModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/LlmSettingsModal.vue) —— 标准 t-dialog

**已有 d3 模块**（图表用）：
- `tdesign-vue-next/chat` 已传递性拉取 `d3` / `d3-scale` / `d3-shape` / `d3-color` 等到 `node_modules`
- 不新增 package.json 依赖

**约束**：
- 必须复用 `skill-gateway` Spring Boot + MyBatis Plus + MySQL 技术栈
- 必须复用 `X-User-Id` 鉴权 + `AamTokenUtil.requireUserId`
- 前端必须复用 useServerLedger / useSkillHub composable-singleton 模式
- DB schema 不变（已有 conversation_logs + tool_call_logs 完全够用）
- 不能动 agent-core
- **不新增第三方包**（AGENTS.md 5.1）
- 不引入新环境变量（AGENTS.md 5.2）

## Goals / Non-Goals

**Goals:**
- 用户登录后点顶栏「Token 用量」→ 弹窗默认显示「概览 Tab」
- **概览 Tab**：4 个总览卡片（含**失败调用次数**）+ 日期范围选择器（默认近 30 天）+ 按天 token 用量堆叠柱状图（d3 自绘）+ **Y 轴单位切换**（token / 千token / 万token）
- **会话列表 Tab**：用户所有**真有 LLM 调用的会话**，按 endedAt DESC；**失败/部分失败的会话显式标红 + 状态列**；+ **导出 CSV 按钮**
- **会话详情 Tab**：单次会话的每轮 LLM 调用明细（成功+失败），**按 called_at DESC 排序（最新在最前）**；失败行**标红 + 显示 error_message**
- 日期范围选择器联动 3 个 Tab
- 严格 per-user 隔离：`X-User-Id == ?userId=` 否则 403
- 复用现有 conversation_logs + tool_call_logs，**零 DB schema 变更**
- vue-tsc 零 TS6133（AGENTS.md 5.6）

**Non-Goals:**
- 不做实时刷新 / WebSocket 推送
- 不做"按 skill 名筛选"
- 不做"删除日志"操作（只读）
- 不做饼图
- 不做按小时聚合
- 不做"管理员视角看任意用户"
- 不动 agent-core
- 不影响运营看板
- 不导出 Excel（只 CSV）
- 不做重试失败的 LLM 调用（只展示，不修复）

## Decisions

### 决策 1：聚合单位 —— 四层 + 按天

**选**：**四层都做**

| 层 | 数据源 | 用途 | 排序 | 过滤 |
|----|--------|------|------|------|
| 概览卡片 | `conversation_logs` SUM + COUNT | 顶部 4 个数字 | — | 含失败行 |
| 按天图表 | `conversation_logs` GROUP BY DATE(created_at) | 概览 Tab 柱状图 | by date ASC | 含失败行（callCount + failedCount 分开计） |
| 会话列表 | `conversation_logs` GROUP BY session_id | 会话列表 Tab | by endedAt DESC | 见决策 10 |
| 会话明细 | `conversation_logs` WHERE session_id | 详情 Tab | by called_at DESC | 含失败行（标红 + error_message） |

### 决策 2：日期范围 —— 默认近 30 天 + 自定义

**选**：**后端接受 `startDate / endDate`（yyyy-MM-dd），前端默认近 30 天**

### 决策 3：API 鉴权 —— 双参数校验

**选**：**强制 `X-User-Id == ?userId=`，否则 403**

### 决策 4：弹窗宽度 / 复用 SkillHub 模式

**选**：**复用 SkillHub 弹窗 + t-tabs**

### 决策 5：DB schema 变更 —— 不变

**选**：**零 schema 变更**

### 决策 6：图表库 —— 复用 d3（无新依赖）

**选**：**复用 `d3-scale` + `d3-shape` + 自绘 SVG**

### 决策 7：图表类型 —— 堆叠柱状图

**选**：**堆叠柱状图（prompt 在下，completion 在上）**

### 决策 8：会话详情排序 —— called_at DESC

**选**：**详情 Tab SQL 强制 `ORDER BY cl.created_at DESC`**

### 决策 9：日期范围缺省值处理

**选**：
- 前端 `startDate / endDate` 默认 `null`（"全部"）→ 后端不 WHERE 过滤
- 前端日期范围选择器默认值 `今天 - 30天 ~ 今天`

### 决策 10：会话过滤规则 —— 仅排除"完全无 conversation_logs 行"的会话

**选**：**SQL 不用 HAVING；GROUP BY session_id 自然过滤 + 显式包含 failed 会话**

**理由**：
- 用户最新要求："调用失败或者报错的记录也得展示到前端记录"
- 之前要求的"只展示真的调用过大模型的"等价于"session 至少存在 1 条 conversation_logs 行"——GROUP BY session_id 自然满足
- 失败会话 `SUM(total_tokens) = 0` 但有行，必须保留
- **修正**：去掉原来的 `HAVING SUM(total_tokens) > 0` 过滤

**SQL 调整**：
```sql
SELECT
    cl.session_id,
    c.name AS conversation_name,
    MIN(cl.created_at) AS started_at,
    MAX(cl.updated_at) AS ended_at,
    SUM(cl.prompt_tokens) AS total_prompt,
    SUM(cl.completion_tokens) AS total_completion,
    SUM(cl.total_tokens) AS total_tokens,
    SUM(cl.llm_rounds) AS total_rounds,
    SUM(cl.tool_call_rounds) AS total_tool_rounds,
    COUNT(DISTINCT cl.skill_name) AS unique_skills_count,
    SUM(CASE WHEN cl.is_success = 0 THEN 1 ELSE 0 END) AS failed_calls,
    -- 状态：任一 round 失败 → FAILED；否则 SUCCESS
    MAX(CASE WHEN cl.is_success = 0 THEN 'FAILED' ELSE 'SUCCESS' END) AS status
FROM conversation_logs cl
LEFT JOIN conversation c ON c.conversation_id = cl.session_id
WHERE cl.user_id = #{userId}
  AND cl.updated_at >= #{startDate}    -- 可选
  AND cl.updated_at < #{endDatePlus1}  -- 可选
GROUP BY cl.session_id, c.name
HAVING COUNT(*) > 0  -- 等价于"至少有 1 个 LLM round"，实际是废话，保留为防御性
ORDER BY MAX(cl.updated_at) DESC
LIMIT #{size} OFFSET #{offset}
```

> 注释：HAVING COUNT(*) > 0 在 GROUP BY 之后永远为 true（因为 GROUP BY 至少需要 1 行）。写它是为了显式表达"只统计真有 LLM round 的会话"，并在 defense-in-depth 层防止 NULL session_id 串入。

### 决策 11：Y 轴单位切换 —— 3 档（token / 千token / 万token）

**选**：**3 档切换，前端 t-segmented 控件 + 图表 prop 切换，默认千token**

### 决策 12：列表导出 CSV —— 客户端生成 + Blob 下载

**选**：**前端纯客户端生成 CSV，触发浏览器下载**

**理由**：单用户数据量小，本地序列化即可。

### 决策 13：失败记录 UI 标识 —— 标红 + 状态列 + 错误信息

**选**：**前端按 `is_success` / `status` 字段条件渲染**

**实现**：
- 列表 tab：t-table 行 `class` 条件绑定 `rowClassName: (row) => row.status === 'FAILED' ? 'row-failed' : ''`
- CSS：`.row-failed { background: #fff1f0; }`（TDesign 失败色）
- 详情 tab：失败行额外显示 `error_message` 列；时长 / token 列显示 "—"
- 概览 tab 顶部新增第 5 张卡片"失败调用次数"（与总数并列）

**data 属性**：
- `TokenUsageCallDetailDTO.is_success: boolean`（保留原字段名）
- `TokenUsageCallDetailDTO.error_message: String`（保留原字段名）
- `TokenUsageCallDetailDTO.status: String`（SUCCESS / FAILED，service 层根据 is_success 推断）
- `TokenUsageOverviewDTO.failedCalls: long`（service 层 COUNT WHERE is_success = 0）
- `TokenUsageConversationSummaryDTO.failedCalls: long`（同上，GROUP BY 阶段）
- `TokenUsageDailyPointDTO.failedCount: int`（同）

## File-Level Diff

### 新增后端文件

```
backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/
├── dto/
│   ├── TokenUsageOverviewDTO.java           # +failedCalls
│   ├── TokenUsageConversationSummaryDTO.java # +failedCalls + status
│   ├── TokenUsageCallDetailDTO.java         # +status + errorMessage + isSuccess
│   ├── TokenUsageSessionDetailDTO.java
│   ├── TokenUsageConversationPageDTO.java
│   ├── TokenUsageDailyPointDTO.java         # +failedCount
│   └── TokenUsageDailyResponseDTO.java
├── service/
│   └── TokenUsageService.java
└── controller/
    └── TokenUsageController.java
```

### 修改后端文件

```
backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/
├── mapper/
│   ├── ConversationLogMapper.java  # findSummariesByUserId 改 @Select + 失败计数
│   └── ToolCallLogMapper.java
└── config/
    └── SecurityConfig.java         # +permitAll /api/token-usage/**
```

### 新增前端文件

```
frontend/src/
├── composables/
│   └── useTokenUsage.ts
└── components/
    ├── TokenUsagePanel.vue
    └── TokenUsageDailyChart.vue
```

### 修改前端文件

```
frontend/src/components/Layout.vue
├── 顶栏 t-button 新增：Token 用量
└── 模板底部 <TokenUsagePanel />
```

**Total**: 9 个新文件（7 后端 + 2 前端）+ 1 个修改文件（Layout.vue）+ 2 个 mapper 改写 + SecurityConfig 加白名单

## Risks / Mitigations

### Risk 1：水平越权
**Mitigation**：双参数校验 + 单测覆盖。

### Risk 2：大表性能
**Mitigation**：3 个 ensureIndex（任务 10）。

### Risk 3：内网大模型 token 字段为 NULL
**Mitigation**：前端 t-table 数字列允许显示 "—"；概览卡片 SUM(NULL) = NULL → 显示 0。

### Risk 4：d3-* 是 transitive deps
**Mitigation**：tasks 7.6 加 fallback。

### Risk 5：vue-tsc 严格模式报 TS6133
**Mitigation**：每个解构 / ref 都在 template 或 script 中实际使用；rowClassName 回调函数在 script 顶层声明并在 t-table props 中引用，避免 unused。

### Risk 6：日期范围选择器传 ISO datetime
**Mitigation**：后端 `@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)`；前端 `value-type="YYYY-MM-DD"`。

### Risk 7：CSV 导出中文乱码
**Mitigation**：CSV 头部加 BOM `\ufeff`。

### Risk 8：error_message 字段可能含换行 / 引号导致 CSV 解析错
**Mitigation**：`escapeCsvCell` 处理引号转义 + 换行包裹。

### Risk 9：失败会话大量出现时整体列表可读性下降
**Mitigation**：标红是视觉提示，不影响 CSV 导出；状态列 + 失败次数列让用户快速识别。

### Risk 10：detail tab 失败行的 skill 名可能为空（因为 round 在 LLM 失败时没机会调 skill）
**Mitigation**：skillNames 数组允许为空，UI 显示 "—"。

### Risk 11：用户切到用户 B 时旧失败会话残留显示
**Mitigation**：`watch(currentUser?.id)` 触发整体 refetch，覆盖全部数据。