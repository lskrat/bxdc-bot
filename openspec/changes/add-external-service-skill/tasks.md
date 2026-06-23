## 1. 数据库层

- [ ] 1.1 将 `external_service` 和 `external_service_input` 的 DDL 追加到 `backend/skill-gateway/src/main/resources/schema-mysql.sql`
- [ ] 1.2 在 `SchemaMigrationRunner` 启动检查中添加表创建逻辑（CREATE TABLE IF NOT EXISTS）
- [ ] 1.3 插入种子数据：`weather-openweathermap`（GET，apiKey 认证，3 个 query inputs）和 `py-sandbox`（POST，bearer 认证，2 个 body inputs，is_raw=1）—— 凭证使用 `AesCipher.encrypt` 加密后存入
- [ ] 1.4 验证表已创建：`SHOW TABLES LIKE 'external_service%'` 返回 2 行

## 2. 后端 — 数据层

- [ ] 2.1 创建 `ExternalService.java` 实体（按规格定义所有列，`sort_order` 默认 0）
- [ ] 2.2 创建 `ExternalServiceInput.java` 实体（按规格定义所有列，`sort_order` 默认 0）
- [ ] 2.3 创建 `ExternalServiceMapper.java`（MyBatis-Plus BaseMapper）
- [ ] 2.4 创建 `ExternalServiceInputMapper.java`（MyBatis-Plus BaseMapper）
- [ ] 2.5 创建 `ExternalServiceMapper.xml`（按 name 查询，ORDER BY sort_order ASC, id ASC）
- [ ] 2.6 创建 `ExternalServiceInputMapper.xml`（按 serviceId 查询，ORDER BY sort_order ASC, id ASC）
- [ ] 2.7 创建 `SkillInputDefinition.java` DTO（key、displayName、isRequired、placeholder、valueType、description、mapsTo、sortOrder）
- [ ] 2.8 创建 `ExternalServiceRequest.java` DTO（service 字段 + List<InputRequest>）
- [ ] 2.9 创建 `ExternalServiceView.java` DTO（service 字段 + List<InputView>，getter 中对 auth_value_static 解密）

## 3. 后端 — 注册服务

- [ ] 3.1 创建 `ExternalServiceRegistry.java` 服务（单例；`getByNameOrThrow(name)`、`listEnabled()`、`listInputs(serviceId)` —— 全部 ORDER BY sort_order ASC, id ASC）
- [ ] 3.2 创建 `DynamicTokenCache.java` 服务（ConcurrentHashMap<serviceName, CachedToken>；按 serviceName 同步；TTL 来自 `auth_token_cache_seconds`）
- [ ] 3.3 创建 `ExternalServiceController.java`（admin CRUD，`/api/external-service`；admin 专写；非 admin 仅读 enabled=true 行）
- [ ] 3.4 创建 `ExternalServiceQueryController.java`（`GET /api/external-service/{serviceName}/inputs`，供前端联动下拉，ORDER BY sort_order ASC, id ASC）
- [ ] 3.5 验证 admin 接口：创建/读取/更新/删除 service 和 input 行；非 admin 写操作返回 403；禁用服务列表返回 403

## 4. 后端 — 映射校验

- [ ] 4.1 创建 `MappingValidator.java`（校验：对于所有 `external_service_input.is_required=1`，至少有一个 `skillInput.mapsTo` 等于该 `external_param_name`）
- [ ] 4.2 创建 `SkillInputMapping.java`（validator 用，FK 解析）
- [ ] 4.3 在 `SkillService.createOrUpdate()` 中集成 `MappingValidator.validate()`，在持久化任何 `kind=external` 的 Skill 前执行校验
- [ ] 4.4 测试：创建缺少必填外部入参的 Skill → HTTP 400，并返回缺失的参数名

## 5. 后端 — 执行器

- [ ] 5.1 创建 `ExternalServiceSkillExecutor.java`，包含 `executeExternalSkill(skill, config, parameters, userId)`：
  - 从 config 中加载 `serviceName` → 从 registry 获取 `ExternalService`
  - 将 `configuration.inputs` JSON 解析为 `List<SkillInputDefinition>`
  - 校验必填 Skill 输入字段（缺失返回 HTTP 400）
  - 遍历 `inputs[]`（跳过 mapsTo=null）；将每个 mapsTo → `ExternalServiceInput`
  - 组装 path（替换 `{external_param_name}`）、query（URL 编码，is_raw=1 除外）、body（按第一个 body 的 content_type：JSON/form/text）、headers
  - 注入认证（apiKey/bearer/dynamicToken）
- [ ] 5.2 验证：`city="北京"` mapsTo `q`（query, is_raw=0）→ `?q=%E5%8C%97%E4%BA%AC`
- [ ] 5.3 验证：`code="print('hello')"` mapsTo `code`（body, json, is_raw=1）→ body 包含未转义字符串
- [ ] 5.4 验证：`internalNote` mapsTo null → 不出现在出站请求中

## 6. 后端 — HTTP 客户端与重试

- [ ] 6.1 创建 `RetryableHttpClient.java`，包含 `callApiWithRetry(url, method, headers, body, retryMax, backoffMs, timeoutSeconds, auditMode, auditSafeParams)`，复用现有 `ApiProxyService.callApi()` 内部实现（无新依赖）
- [ ] 6.2 实现指数退避：1×、2×、4× 基础毫秒数
- [ ] 6.3 实现审计日志：`HttpClientAuditMode.SKILL_OUTBOUND`
- [ ] 6.4 验证：`retry_max=2`，第一次尝试失败 → 总共恰好 3 次尝试

## 7. 后端 — 响应与脱敏

- [ ] 7.1 创建 `ExternalResponseFormatter.java`（`format(response, responseFormat)` → JSON 解析 / 原始字符串 / Base64 编码）
- [ ] 7.2 创建 `ExternalOutboundPayloadMasker.java`（`mask(llmParams, inputs, inputByName, skillInputs)` → 将 `sensitive=1` 的值替换为 `"***MASKED***"`）
- [ ] 7.3 验证：`sensitive=1` 字段 → `api_call_log.payload` 包含 `"***MASKED***"`

## 8. 后端 — Gateway 集成

- [ ] 8.1 在 `SkillExecutionService.execute()` switch 中添加 `case "external"`，委托给 `ExternalServiceSkillExecutor`
- [ ] 8.2 在 `SystemSkillController` 中添加 `buildExternalConfigSchema(ExternalService svc)`：
  - 静态部分：`serviceName`（select）、`operation`（input）、`interfaceDescription`（textarea）
  - 动态部分：`inputs[]`（ui: dynamicList；`mapsTo` 是联动 select，从 `/api/external-service/{name}/inputs` 获取选项）
- [ ] 8.3 验证：`GET /api/system-skills/execution-types` 包含 external services；选择一个后加载其输入 schema

## 9. 前端 — 类型与编辑器

- [ ] 9.1 在 `utils/skillEditor.ts` 的 `ConfigKind` 联合类型中添加 `'external'`
- [ ] 9.2 创建 `SkillInputDraft` 接口（key、displayName、isRequired、placeholder、valueType、description、mapsTo、sortOrder）
- [ ] 9.3 创建 `ExternalConfigDraft` 接口（`kind: 'external'`、`serviceName`、`operation`、`interfaceDescription`、`inputs: SkillInputDraft[]`）
- [ ] 9.4 添加 `parseExternalDraft(config)`、`serializeExternalDraft(draft)`、`isExternalDraft(draft)`、`EXTERNAL_ALLOWED_KEYS`
- [ ] 9.5 在 `parseSkillDraft`、`serializeSkillDraft`、`createDefaultSkillDraft`、`CONFIG_KIND_LABELS`、`getPresetLabel` 中添加 `'external'` 分支
- [ ] 9.6 验证 TypeScript 编译：`npx vue-tsc -b` 零错误通过

## 10. 前端 — 弹窗

- [ ] 10.1 在 `SkillManagementModal.vue` 的 `draftToFormValues()` 中添加 `'external'` 分支：
  - 映射静态字段：`serviceName`、`operation`、`interfaceDescription`
  - 映射动态 `inputs[]` 数组到表单状态
- [ ] 10.2 在 `updateDraftFromFormValues()` 中添加 `'external'` 分支（反向映射；校验 key 唯一性）
- [ ] 10.3 接入 `mapsTo` 联动 select：`serviceName` 变化时调用 `GET /api/external-service/{name}/inputs`，填充选项并在最前面加入"（不传给第三方）"选项
- [ ] 10.4 实现 `inputs[]` 动态列表：Skill 输入框的添加/删除/排序按钮
- [ ] 10.5 验证：创建带有 4 个 inputs（city/units/lang/internalNote）的 external Skill → 正确保存 → LLM 工具 schema 显示 4 个字段
- [ ] 10.6 验证：创建带有重复 `inputs[].key` 的 external Skill → 表单校验错误

## 11. 验证与构建

- [ ] 11.1 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml -DskipTests compile` → BUILD SUCCESS
- [ ] 11.2 `cd frontend && npx vue-tsc -b` → 零错误
- [ ] 11.3 `cd frontend && npm run build` → exit 0
- [ ] 11.4 手工端到端：admin 插入天气服务 → 业务方创建带 4 个 inputs 的 Skill → LLM 调用 Skill（`city="上海"`）→ 验证出站 URL：`?q=%E4%B8%8A%E6%B5%B7&appid=xxx`（URL 中无 internalNote）
- [ ] 11.5 手工端到端：LLM 缺少必填字段 `city` → 返回 HTTP 400

## 12. 文档

- [ ] 12.1 将最终设计稿复制到 `docs/external-service-skill-design.md`（为历史记录引用本次 change）
- [ ] 12.2 在 `schema-mysql.sql` 和 `SchemaMigrationRunner` 中添加关于两张新表的迁移说明
- [ ] 12.3 运行 `openspec status --change add-external-service-skill` 确认所有 artifacts 已完成
