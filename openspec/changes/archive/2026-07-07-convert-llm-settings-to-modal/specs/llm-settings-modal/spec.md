## ADDED Requirements

### Requirement: LLM Settings Opened as Modal from Top Header

The system SHALL expose the LLM connection settings (`apiBase` / `modelName` / `apiKey`) as a modal dialog opened from the top header of the chat layout, instead of navigating the user to a dedicated route page. Opening the modal SHALL NOT replace or unmount the chat conversation view underneath.

#### Scenario: User clicks "大模型设置" in the top header
- **WHEN** an authenticated user clicks the "大模型设置" button in the top header of [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue)
- **THEN** a `t-dialog` modal opens in the foreground
- **AND** the modal title is "大模型连接"
- **AND** the chat conversation view (sidebar + message list + input) underneath is unchanged
- **AND** no route navigation occurs (URL stays at `/`)

#### Scenario: Modal fetches current settings on open
- **WHEN** the modal transitions from hidden to visible
- **THEN** the frontend calls `GET /api/users/{userId}/llm-settings` (via `useUser.fetchLlmSettings`)
- **AND** the form fields `apiBase` and `modelName` are populated from the response
- **AND** the API Key input is left empty (security: never echoed back)
- **AND** the "current API Key saved" hint is shown when `hasApiKey` is `true` in the response

#### Scenario: Modal saves settings on confirm
- **WHEN** the user edits `apiBase` / `modelName` (and optionally `apiKey`) and clicks "保存"
- **THEN** the frontend calls `PUT /api/users/{userId}/llm-settings` (via `useUser.saveLlmSettings`)
- **AND** the Save button shows loading state during the request
- **AND** on success, a success message is shown and the API Key input is cleared
- **AND** on error, an error message is shown without closing the modal
- **AND** the chat conversation view is still unchanged underneath

#### Scenario: User clears a saved API Key from the modal
- **WHEN** the user clicks "清除已存密钥" while `hasStoredKey` is `true`
- **THEN** the frontend calls `PUT /api/users/{userId}/llm-settings` with `apiKey: ""` (via `useUser.saveLlmSettings`)
- **AND** the "current API Key saved" hint disappears after success

#### Scenario: User closes the modal
- **WHEN** the user clicks the modal's close button (X), cancel button, or presses Escape, or clicks the backdrop
- **THEN** the modal closes
- **AND** the user returns to the chat conversation view at the exact scroll position they were at
- **AND** no fetch or save request is triggered by closing

### Requirement: Legacy `/settings` Route Kept as Fallback

The system SHALL keep the existing `/settings` Vue Router route and the legacy [SettingsView.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue) page registered as a fallback for users who arrive via direct URL or bookmark. The modal path SHALL be the primary entry point, and the legacy page SHALL NOT be linked from any in-app navigation (top header, sidebar, footer, breadcrumb, etc.).

#### Scenario: `/settings` route still registered
- **WHEN** the Vue Router configuration in [router/index.ts](file:///Users/dccb/botproject/fishtank/frontend/src/router/index.ts) is loaded at app startup
- **THEN** the entry with `path: '/settings'` still exists
- **AND** `SettingsView.vue` is still imported and mounted when that route is matched

#### Scenario: SettingsView.vue file is retained
- **WHEN** the frontend codebase is checked
- **THEN** the file `frontend/src/views/SettingsView.vue` still exists
- **AND** no source file references it other than the router module

#### Scenario: Direct URL `/settings` renders the legacy page
- **WHEN** a user types `/settings` directly in the browser address bar (or follows an external bookmark)
- **THEN** the Vue Router renders `SettingsView` (legacy full-page form)
- **AND** the page remains reachable as a fallback; the modal path is not enforced

#### Scenario: In-app navigation no longer points at `/settings`
- **WHEN** the user navigates the app via the top header / sidebar / footer / breadcrumb / any in-app link
- **THEN** no in-app link routes to `/settings` (the top-header button opens the modal instead)

### Requirement: Modal Reuse Existing LLM Settings Backend

The LLM settings modal SHALL reuse the existing `useUser.fetchLlmSettings(userId)` and `useUser.saveLlmSettings(userId, body)` functions without changing their signatures, HTTP endpoints, or request/response shapes. No new backend endpoints SHALL be added.

#### Scenario: Modal uses existing fetchLlmSettings function
- **WHEN** the modal needs to load the user's saved settings
- **THEN** it calls the existing `fetchLlmSettings(userId)` from [useUser.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useUser.ts)
- **AND** the returned `LlmSettingsResponse { apiBase, modelName, hasApiKey }` is consumed as-is

#### Scenario: Modal uses existing saveLlmSettings function
- **WHEN** the user clicks Save or Clear Stored Key
- **THEN** the modal calls the existing `saveLlmSettings(userId, payload)` from [useUser.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useUser.ts)
- **AND** the request body shape `{ apiBase, modelName, apiKey? }` matches the previous `SettingsView` implementation
- **AND** no new backend endpoint is created

### Requirement: Modal Follows Existing Top-Header Modal Pattern

The LLM settings modal SHALL follow the same composable-singleton pattern used by [useServerLedger.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useServerLedger.ts) and [useSkillHub.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useSkillHub.ts) for opening/closing state. The modal component SHALL be mounted once at the bottom of the Layout template, similar to `<ProfileEditModal />` and `<ServerLedger />`.

#### Scenario: useLlmSettings composable exposes toggle and visible state
- **WHEN** any component calls `useLlmSettings()`
- **THEN** it returns an object with at least `{ isLlmSettingsVisible: Ref<boolean>, toggleLlmSettings: () => void }`
- **AND** `isLlmSettingsVisible` is a module-level singleton ref (shared across all callers)
- **AND** `toggleLlmSettings()` flips the visibility and, when transitioning from false → true, triggers `fetchLlmSettings`

#### Scenario: LlmSettingsModal is mounted in Layout template
- **WHEN** the app shell renders [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue)
- **THEN** the template contains a single `<LlmSettingsModal />` element at the same level as `<ProfileEditModal />` and `<SkillHub />`
- **AND** the modal's visibility is driven by `useLlmSettings().isLlmSettingsVisible` (no props required)

### Requirement: Build Passes vue-tsc Strict Mode with Zero TS6133

The implementation SHALL result in a clean `npx vue-tsc -b` run (strict build mode) with zero output and zero TS6133 errors, per [AGENTS.md 5.6](file:///Users/dccb/botproject/fishtank/AGENTS.md).

#### Scenario: All new declarations are used
- **WHEN** the implementation is complete and `cd frontend && npx vue-tsc -b` is run
- **THEN** the command exits with code 0
- **AND** no output is produced (no TS6133 "declared but not used" warnings)
- **AND** `cd frontend && npm run build` also exits with code 0