## Purpose

Provide per-user token usage analytics across conversations: aggregate prompt/completion tokens, total calls, failed calls, daily trends, per-conversation drill-down, and CSV export. All aggregations include both successful and failed LLM rounds so users can see "wasted" tokens from network errors and LLM rejections.

---

## Requirements

### Requirement: Per-User Conversation List with Aggregated Token Stats + Date Filter

The system SHALL expose a REST endpoint `GET /api/token-usage/conversations?userId=X&startDate=&endDate=&page=1&size=20&keyword=` that returns the list of conversations belonging to the user identified by `userId`. The list SHALL include all conversations that have at least one `conversation_logs` row (i.e., at least one LLM round attempt — successful OR failed). The endpoint SHALL also return an overview object with totals.

#### Scenario: Authenticated user fetches their own conversation list without date filter
- **WHEN** a request arrives at `GET /api/token-usage/conversations?userId=151515&page=1&size=20` with `X-User-Id: 151515` header and no date params
- **THEN** the endpoint returns HTTP 200 with all the user's sessions that have at least one `conversation_logs` row (sorted by `endedAt DESC`)
- **AND** the response includes an `overview` object with `totalPromptTokens / totalCompletionTokens / totalTokens / totalCalls / totalSessions / failedCalls`

#### Scenario: Date filter is inclusive on both ends
- **WHEN** startDate=2026-07-01 and endDate=2026-07-08
- **THEN** sessions on 2026-07-01 00:00:00 and 2026-07-08 23:59:59 are BOTH included
- **AND** sessions on 2026-07-09 are excluded

#### Scenario: Sessions with no LLM attempts at all are excluded
- **WHEN** a conversation exists in `conversation` table but has NO `conversation_logs` rows (user created but never sent a message)
- **THEN** that session SHALL NOT appear in the response list
- **AND** `totalSessions` in overview SHALL NOT count it

#### Scenario: Sessions with only failed LLM calls are INCLUDED
- **WHEN** a session has 3 `conversation_logs` rows all with `is_success = 0` (LLM call failed each time, e.g., network error)
- **THEN** that session SHALL appear in the response with `totalTokens: 0`, `failedCalls: 3`, `status: "FAILED"`
- **AND** it SHALL be visually marked (frontend applies red row styling)

#### Scenario: Sessions with mixed success/failure are INCLUDED with mixed status
- **WHEN** a session has 5 rows: 3 successful, 2 failed
- **THEN** that session appears in the response with `failedCalls: 2`, `status: "FAILED"` (any failure → session-level FAILED)
- **AND** `totalTokens` = sum of successful rounds only

#### Scenario: User attempts to query another user's token usage
- **WHEN** a request arrives with mismatched `X-User-Id` header vs `?userId=` query
- **THEN** the endpoint returns HTTP 403 with error code `FORBIDDEN_OTHER_USER`

#### Scenario: Conversation name is null because conversation row was deleted
- **WHEN** a `conversation_logs.session_id` has no matching row in `conversation` table
- **THEN** the response row's `conversationName` field is `null`
- **AND** the frontend falls back to displaying the first 8 characters of `sessionId`

### Requirement: Per-Conversation Call Detail Sorted by Time Descending (Including Failures)

The system SHALL expose `GET /api/token-usage/conversations/{sessionId}?userId=X` that returns ALL per-LLM-call records for the session (successful AND failed), sorted by `called_at` DESC.

#### Scenario: Detail includes failed rounds
- **WHEN** the conversation has 5 rounds where rounds 2 and 5 failed (`is_success = 0`)
- **THEN** all 5 rounds appear in the response
- **AND** failed rounds have `status: "FAILED"`, `errorMessage: "<actual error>"`, and `totalTokens: 0`
- **AND** successful rounds have `status: "SUCCESS"` and proper token counts

#### Scenario: Detail order is most-recent-first
- **WHEN** the conversation has 5 LLM rounds at times T1 < T2 < T3 < T4 < T5
- **THEN** `calls[0].calledAt == T5` (latest round, regardless of success/fail status)
- **AND** the array is strictly sorted DESC with no ties

#### Scenario: Failed round shows error message
- **WHEN** a round has `is_success = 0` and `error_message = "Connection refused: api.siliconflow.cn"`
- **THEN** the response includes `errorMessage: "Connection refused: api.siliconflow.cn"`
- **AND** the frontend displays this message in the detail row's "错误信息" column

#### Scenario: User attempts to fetch another user's session detail
- **WHEN** with mismatched `X-User-Id` header vs `?userId=` query
- **THEN** the endpoint returns HTTP 403

### Requirement: Per-User Daily Token Usage Aggregation (Including Failures)

The system SHALL expose `GET /api/token-usage/daily?userId=X&startDate=&endDate=` returning one data point per day for the user's LLM calls (successful + failed), with `date / totalTokens / promptTokens / completionTokens / callCount / failedCount`.

#### Scenario: Failed rounds counted in daily aggregation
- **WHEN** 2026-07-08 has 10 successful rounds (5000 tokens total) and 2 failed rounds (0 tokens)
- **THEN** the daily point for 2026-07-08 shows `totalTokens: 5000, promptTokens: 3500, completionTokens: 1500, callCount: 12, failedCount: 2`

#### Scenario: Days with only failed rounds show non-zero callCount
- **WHEN** 2026-07-09 has 3 failed rounds (0 tokens)
- **THEN** the daily point for 2026-07-09 shows `totalTokens: 0, callCount: 3, failedCount: 3`

#### Scenario: User attempts to fetch another user's daily stats
- **WHEN** with mismatched `X-User-Id` vs `?userId=`
- **THEN** the endpoint returns HTTP 403

### Requirement: Frontend Token Usage Modal with Overview / List / Detail Tabs

The system SHALL provide a [TokenUsagePanel.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/TokenUsagePanel.vue) modal with three tabs. The date range selector at the top SHALL default to the last 30 days.

#### Scenario: User clicks "Token 用量" button
- **WHEN** an authenticated user clicks the button
- **THEN** the modal opens with default tab "概览"
- **AND** the 5 overview cards show totals (4 token counts + 1 failed call count)
- **AND** the daily chart loads from the daily endpoint
- **AND** the date range selector shows the last 30 days

#### Scenario: User changes date range
- **WHEN** the user selects a new date range
- **THEN** all data refreshes across all 3 tabs

#### Scenario: User clicks a conversation row to view detail
- **WHEN** the user clicks a row in the "会话列表" tab
- **THEN** the modal switches to "会话详情" tab
- **AND** detail rows are sorted by `calledAt DESC` (latest first)

#### Scenario: Modal mounts only when user is authenticated
- **WHEN** `currentUser` is `null`
- **THEN** the "Token 用量" button SHALL NOT render

### Requirement: Failed Records Are Visually Marked in All Tabs

Failed records SHALL be visually distinguishable from successful ones in all 3 tabs.

#### Scenario: Failed session row in list tab is highlighted
- **WHEN** a conversation row has `status: "FAILED"`
- **THEN** the row SHALL have a red background color (e.g., `#fff1f0`)
- **AND** the "状态" column shows a `<t-tag theme="danger">FAILED</t-tag>` element

#### Scenario: Failed round row in detail tab is highlighted
- **WHEN** a round row has `status: "FAILED"`
- **THEN** the row SHALL have a red background color
- **AND** the "错误信息" column SHALL display the `errorMessage` (truncated to 200 chars with ellipsis if longer)
- **AND** the "token" columns SHALL display "—" (em dash for null/zero)

#### Scenario: Overview tab shows failed calls count
- **WHEN** the user views the overview tab
- **THEN** one of the 5 overview cards displays "失败调用次数" with the count from `overview.failedCalls`
- **AND** if `failedCalls > 0`, the card uses danger color

### Requirement: Daily Token Usage Chart with Y-Axis Unit Switcher

The overview tab SHALL display a stacked bar chart rendered with `d3-scale` + SVG. A unit switcher SHALL allow toggling the Y-axis display between `token` (raw), `千` (÷1000), `万` (÷10000).

#### Scenario: Chart renders with valid daily data
- **WHEN** the daily endpoint returns 30 non-zero data points
- **THEN** the chart renders 30 stacked bars on the X axis

#### Scenario: Chart handles days with zero usage
- **WHEN** a day has `totalTokens: 0, callCount: 0`
- **THEN** the chart still renders an empty bar at that X position

#### Scenario: User switches Y-axis unit to "千 token"
- **WHEN** the user selects `千 token`
- **THEN** the Y-axis tick labels display values divided by 1000
- **AND** tooltip values also display in the selected unit

#### Scenario: Default unit is "千 token"
- **WHEN** the chart first renders
- **THEN** the default unit is `千 token`

### Requirement: Conversation List CSV Export

The conversation list tab SHALL provide a "导出 CSV" button that downloads the visible list as a CSV file (UTF-8 with BOM).

#### Scenario: User clicks "导出 CSV" button
- **WHEN** the user clicks the button
- **THEN** a CSV file is downloaded with filename `token-usage-{userId}-{YYYY-MM-DD}.csv`
- **AND** the CSV contains headers: `会话标题, 开始时间, 结束时间, 轮次, 总token, prompt tokens, completion tokens, skill数, 失败次数, 状态`
- **AND** one row per conversation in the current visible list (including failed ones)

#### Scenario: Failed sessions appear in CSV with FAILED status
- **WHEN** a failed session is in the list
- **THEN** the CSV row's "状态" column shows "FAILED"
- **AND** the "失败次数" column shows the failure count

#### Scenario: Cells with commas or quotes are escaped
- **WHEN** a cell contains `,` or `"` or newline
- **THEN** it is wrapped in double quotes with internal quotes doubled

### Requirement: Modal Follows Existing Top-Header Modal Pattern

The Token Usage modal SHALL follow the composable-singleton pattern used by [useSkillHub.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useSkillHub.ts).

#### Scenario: useTokenUsage composable exposes toggle and visible state
- **WHEN** any component calls `useTokenUsage()`
- **THEN** it returns `{ isTokenUsageVisible: Ref<boolean>, toggleTokenUsage: () => void, activeTab, dateRange, ... }`

#### Scenario: TokenUsagePanel is mounted in Layout template
- **WHEN** [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue) renders
- **THEN** the template contains a single `<TokenUsagePanel />` element

### Requirement: Build Passes vue-tsc Strict Mode with Zero TS6133

The implementation SHALL result in a clean `npx vue-tsc -b` run with zero output.

#### Scenario: All new declarations are used
- **WHEN** `cd frontend && npx vue-tsc -b` is run

