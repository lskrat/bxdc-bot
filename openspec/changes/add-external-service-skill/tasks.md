## 1. 数据库 & Entity 基础

- [ ] 1.1 在 `backend/skill-gateway/src/main/resources/schema-mysql.sql` 追加 2 张表 DDL（`external_service` 13 字段 + `external_service_input` 12 字段；含 `auth_config` JSON 列）
- [ ] 1.2 在 `backend/skill-gateway/src/main/java/.../config/SchemaMigrationRunner.java` 加 `migrateExternalService()` + `migrateExternalServiceInput()` 两个幂等 `CREATE TABLE IF NOT EXISTS` 方法（按 AGENTS.md §5.3 模式，HIGHEST_PRECEDENCE 在所有 ApplicationRunner 之前）
- [ ] 1.3 创建 `entity/ExternalService.java`（MyBatis-Plus `@TableName("external_service")`，13 字段；`@TableField(typeHandler = JacksonTypeHandler.class)` 处理 `auth_config` JSON）
- [ ] 1.4 创建 `entity/ExternalServiceInput.java`（MyBatis-Plus `@TableName("external_service_input")`，12 字段）
- [ ] 1.5 创建 `mapper/ExternalServiceMapper.java`（extends `BaseMapper<ExternalService>`）+ `mapper/ExternalServiceInputMapper.java`（extends `BaseMapper<ExternalServiceInput>`）
- [ ] 1.6 创建 `mapper/xml/ExternalServiceMapper.xml`（`listEnabled()` 按 `display_order ASC, id ASC` 排序）+ `mapper/xml/ExternalServiceInputMapper.xml`（`listByServiceId(serviceId)` 按 `display_order ASC, id ASC` 排序）
- [ ] 1.7 创建 `dto/ExternalServiceRequest.java`（admin 增改 DTO：主表字段 + `List<ExternalServiceInputRequest> inputs`）
- [ ] 1.8 创建 `dto/ExternalServiceInputRequest.java`（子表 DTO）
- [ ] 1.9 创建 `dto/ExternalServiceView.java`（出参 DTO：脱敏后的 `auth_config`；`valueStatic` 对非 admin 返回 `***MASKED-XXXX***` 只显后 4 位）

## 2. AuthConfigParser（auth_config JSON 解析）

- [ ] 2.1 创建 `service/AuthConfigParser.java`（包装 Jackson `ObjectMapper`；`getString(key, default)` / `getDecryptedString(key)` / `getJsonNode(key)` / `getLong(key, default)` 方法）
- [ ] 2.2 在 `AuthConfigParser` 中对 `valueStatic` 字段读出后立即 `AesCipher.decrypt()`（构造时传入密文 + 触发解密；避免明文常驻内存）
- [ ] 2.3 `AuthConfigParser.parse(svc.getAuthConfig(), svc.getAuthKind())` 静态工厂；按 `auth_kind` 校验必填字段（`apiKey` 必须有 `headerName`+`valueStatic`；`bearer` 必须有 `valueStatic`；`dynamicToken` 必须有 `tokenEndpoint`+`tokenPath`+`tokenRequestBody`+`cacheSeconds`）；缺字段抛 `IllegalArgumentException`（带可读消息）

## 3. ExternalServiceRegistry（带缓存的注册表服务）

- [ ] 3.1 创建 `service/ExternalServiceRegistry.java`（`@Service`；构造时 `@PostConstruct` 调 `loadAll()` 一次性加载到 `ConcurrentHashMap<Long, ExternalService>` + `ConcurrentHashMap<Long, List<ExternalServiceInput>>`）
- [ ] 3.2 实现 `getByIdOrThrow(Long id)` / `getByNameOrThrow(String name)` / `listEnabled()` / `listInputs(Long serviceId)` 方法
- [ ] 3.3 实现 `invalidateAll()` / `invalidateService(Long serviceId)` 方法（清空缓存，下次访问时重新从 DB 加载）
- [ ] 3.4 实现 `assertExists(String serviceName)` 方法（服务不存在或 `enabled=0` 时抛 `IllegalArgumentException`）
- [ ] 3.5 实现 5 分钟 TTL 后台线程（`@Scheduled(fixedRate = 300_000)` 或 `Executors.newSingleThreadScheduledExecutor`；到期全量重载；与 `python_sandbox` 的 `PythonSandboxRegistry` 缓存模式一致）

## 4. DynamicTokenCache（dynamicToken 模式本地缓存）

- [ ] 4.1 创建 `service/DynamicTokenCache.java`（`ConcurrentHashMap<String, CachedToken>`；`CachedToken { String token; long expiresAt; }`）
- [ ] 4.2 实现 `getOrFetch(ExternalService svc, AuthConfigParser authCfg)` 方法（`synchronized(svc.getName().intern())` 单飞；调 `ApiProxyService.callApi(tokenEndpoint, "POST", emptyHeaders, tokenRequestBody, HttpClientAuditMode.NONE, 10_000)` 拿响应）
- [ ] 4.3 在响应解析中使用 `JsonPathUtils.read(responseBody, tokenPath)`（沿用现有 `JsonPathUtils` 工具类）提取 token；缓存到 `cache` map，`expiresAt = now + cacheSeconds * 1000L`

## 5. RetryableHttpClient（重试封装）

- [ ] 5.1 创建 `service/RetryableHttpClient.java`（`callApiWithRetry(url, method, headers, body, retryMax, timeoutMs, auditMode, auditContext)` 方法）
- [ ] 5.2 退避基数写死 500ms，指数 `Thread.sleep(500 * (1L << attempt))`；`attempt` 从 0 到 `retryMax`；`retryMax=0` 时仅 1 次不重试
- [ ] 5.3 复用 `ApiProxyService.callApi(url, method, headers, body, mode, timeoutMs)`（**不引入新 HTTP 客户端**；沿用现有 `RestTemplate` 配置）
- [ ] 5.4 `InterruptedException` 时 `Thread.currentThread().interrupt()` 并跳出循环

## 6. ExternalResponseFormatter（响应格式处理）

- [ ] 6.1 创建 `service/ExternalResponseFormatter.java`（`format(ResponseEntity<String> resp, String responseFormat)` 静态方法）
- [ ] 6.2 `responseFormat="json"` → `objectMapper.readValue(resp.getBody(), Object.class)` 返回结构化对象
- [ ] 6.3 `responseFormat="text"` → 直接返回 `resp.getBody()` 字符串
- [ ] 6.4 `responseFormat="binary-base64"` → `Base64.getEncoder().encodeToString(resp.getBody().getBytes(StandardCharsets.UTF_8))`

## 7. ExternalOutboundPayloadMasker（审计脱敏）

- [ ] 7.1 创建 `audit/ExternalOutboundPayloadMasker.java`（`mask(Map<String,Object> llmParams, List<ExternalServiceInput> inputs)` 方法）
- [ ] 7.2 遍历子表行：若 `is_sensitive=1` 则将值替换为 `"***MASKED***"`；若 `is_sensitive=0` 则保留原值
- [ ] 7.3 遍历 llmParams 中**不在子表**的 key：保留原值（落审计时可看到 LLM 误传）
- [ ] 7.4 返回的 Map 顺序：`先子表行（按 display_order），再 LLM 额外 key`

## 8. ExternalServiceSkillExecutor（核心出站逻辑）

- [ ] 8.1 创建 `service/ExternalServiceSkillExecutor.java`（`@Service`；`executeExternalSkill(Skill skill, Map<String,Object> config, Object parameters, String userId)` 方法）
- [ ] 8.2 实现 §8.1 伪代码（已设计完整）：
  1. `config.get("serviceName")` → `registry.getByNameOrThrow()` → 检查 `enabled=1`
  2. `registry.listInputs(svc.getId())` 拿子表行
  3. 必填校验：遍历子表 `is_required=1` 的行，检查 `llmParams` 是否含 `external_param_name`
  4. path 替换：`endpoint_url.replace("{" + name + "}", URLEncoder.encode(value, "UTF-8"))`（或 raw 模式不编码）
  5. 拼 query / body / header（按 `param_location` 过滤；`is_raw_transmission` 决定编码方式）
  6. 认证注入：`AuthConfigParser` + switch 按 `auth_kind`
  7. 审计脱敏：`masker.mask()`
  8. 调用：`retryableHttpClient.callApiWithRetry(...)`
  9. 响应处理：`responseFormatter.format()` → 返回 LLM
- [ ] 8.3 二进制 body（`body_content_type=binary`）：调 `FileRefResolver.resolve(fileRef)` → `FileToolService.readInputStream(userFile)` → 用 `RestTemplate` + `MultipartFile` 拼 multipart
- [ ] 8.4 链路追踪透传：注入 `X-Trace-Id` / `X-Request-Id` / `X-User-Id` / `X-Session-Id` 到 `headerMap`（从入站上下文 `RequestContextHolder` 或参数 `userId` 拿）

## 9. SkillExecutionService switch 接入

- [ ] 9.1 在 `backend/skill-gateway/src/main/java/.../service/SkillExecutionService.java` 的 `execute()` switch 中追加 `case "external": return externalServiceSkillExecutor.executeExternalSkill(skill, config, parameters, userId);`
- [ ] 9.2 在 `SkillExecutionService` 注入 `ExternalServiceSkillExecutor`（构造器注入 + `@Autowired` 或 `@RequiredArgsConstructor`）

## 10. SystemSkillController.buildExternalConfigSchema

- [ ] 10.1 在 `backend/skill-gateway/src/main/java/.../controller/SystemSkillController.java` 的 `listExecutionTypes()` 中追加 `external` 循环：`for (ExternalService svc : registry.listEnabled()) { types.add(buildExternalConfigSchema(svc)); }`
- [ ] 10.2 新增 `private JsonNode buildExternalConfigSchema(ExternalService svc)` 方法，schema 只含 2 个键：
  - `serviceName`：`ui: 'select'`，options = 已启用服务名列表
  - `interfaceDescription`：`ui: 'textarea'`
- [ ] 10.3 `additionalProperties: false`（schema 强制拒绝 `inputs` / `mapsTo` / `operation` 旧字段）
- [ ] 10.4 在 `SystemSkillController` 注入 `ExternalServiceRegistry`

## 11. SkillService FK 校验 + 旧字段拒绝

- [ ] 11.1 在 `backend/skill-gateway/src/main/java/.../service/SkillService.java` 的 `createOrUpdate()` 中，对 `kind=external` 的 skill 加 `registry.assertExists(skill.configuration.serviceName)` 校验
- [ ] 11.2 校验失败抛 `IllegalArgumentException`（带可读消息：服务不存在 / 服务禁用 / serviceName 缺失）
- [ ] 11.3 在 `JsonSchemaValidator` 中对 `kind=external` 的 skill 校验 `configuration`：**只允许** `kind` / `serviceName` / `interfaceDescription` 三个键；**拒绝** `inputs` / `mapsTo` / `operation`（用 `additionalProperties: false`）
- [ ] 11.4 校验失败返回 400 + 错误消息

## 12. ExternalServiceController（admin CRUD）

- [ ] 12.1 创建 `controller/ExternalServiceController.java`（`@RestController` `@RequestMapping("/api/external-service")`；所有写接口 `@PreAuthorize("hasRole('ADMIN')")`）
- [ ] 12.2 实现 8 个端点（参考 `external-service-registry/spec.md` Requirement: Admin CRUD for external_service）：
  - `GET /api/external-service` — list（admin-only）
  - `GET /api/external-service/{id}` — get by id（admin-only）
  - `GET /api/external-service/by-name/{name}` — get by name（admin-only）
  - `POST /api/external-service` — create（admin-only；含子表行；事务）
  - `PUT /api/external-service/{id}` — update（admin-only；含子表行替换；事务）
  - `DELETE /api/external-service/{id}` — delete（admin-only；CASCADE 子表行；事务）
  - `POST /api/external-service/{id}/invalidate-cache` — 失效单服务缓存
  - `POST /api/external-service/invalidate-cache` — 失效所有缓存
- [ ] 12.3 在 `create` / `update` 路径中：若 `auth_config.valueStatic` 是明文，**先 `AesCipher.encrypt()` 再存**（兜底加密；admin UI 已加密时 no-op）
- [ ] 12.4 在 `read` 路径中：`ExternalServiceView` 对非 admin role 隐藏 `valueStatic`（返回 `***MASKED-XXXX***`）
- [ ] 12.5 创建 `controller/ExternalServiceQueryController.java`（`GET /api/external-service/{name}/inputs` 公开端点；任何已认证用户可读；返回子表行排除 `is_sensitive`）

## 13. 前端 skillEditor.ts 扩展

- [ ] 13.1 在 `frontend/src/utils/skillEditor.ts` 的 `ConfigKind` union 加 `'external'`
- [ ] 13.2 新增 `ExternalConfigDraft` 接口（**只含 `serviceName` + `interfaceDescription` 两个字段**）
- [ ] 13.3 新增 `parseExternalDraft(config)` / `serializeExternalDraft(draft)` / `isExternalDraft(draft)` 函数
- [ ] 13.4 新增 `EXTERNAL_ALLOWED_KEYS = ['serviceName', 'interfaceDescription']` 常量
- [ ] 13.5 `createDefaultSkillDraft('CONFIG', 'external')` 默认值（`serviceName: ''`，`interfaceDescription: ''`）
- [ ] 13.6 `CONFIG_KIND_LABELS.external = '外部 HTTP 服务'`
- [ ] 13.7 `parseSkillDraft` / `serializeSkillDraft` switch 加 `case 'external'`
- [ ] 13.8 `getConfigKindOptions()` / `getPresetLabel()` 加 `external` 分支
- [ ] 13.9 自查：所有新加的 export / const / function 必须在文件内被引用（避免 TS6133）

## 14. 前端 SkillManagementModal.vue 扩展

- [ ] 14.1 在 `frontend/src/components/SkillManagementModal.vue` 的 `draftToFormValues` / `updateDraftFromFormValues` 加 `isExternalDraft` 分支（**只处理 `serviceName` + `interfaceDescription`**）
- [ ] 14.2 `serviceName` change 时调 `GET /api/external-service/{name}/inputs` 拿子表行 → 渲染**只读预览区**（不写入 configuration）
- [ ] 14.3 预览区按 `display_order` 渲染：每行 = `[display_name 中文 label] (external_param_name 英文) [textarea 预览]`
- [ ] 14.4 保存前**不**复制子表行到 draft；保存时只传 `kind` / `serviceName` / `interfaceDescription` 三个键

## 15. 前端 ConfigFormRenderer.vue 验证

- [ ] 15.1 验证 `ConfigFormRenderer.vue` 已支持 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`（用于 `serviceName` select / `interfaceDescription` textarea）
- [ ] 15.2 **不**实现 `ui: 'dynamicList'`（本设计无 inputs[] 动态表单需求）
- [ ] 15.3 **不**新增任何 `.vue` 文件

## 16. 自查与文档

- [ ] 16.1 前端 `cd frontend && npx vue-tsc -b` 静默通过（零 TS6133）
- [ ] 16.2 前端 `cd frontend && npm run build` 退出码 0
- [ ] 16.3 后端 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml -DskipTests compile` 通过（JDK 1.8 编译；AGENTS.md §2.4 启动 mvn 必须先 cd 到 skill-gateway）
- [ ] 16.4 后端 `java -cp ... AesCipher encrypt "sk-xxx"` 验证加密工具可用
- [ ] 16.5 冷启动验证：清空 DB → 启动 gateway → `SHOW TABLES LIKE 'external_service%'` 确认 2 张表自动创建
- [ ] 16.6 手工跑 `docs/external-service-skill-design.md §9` 完整流程示例（admin 配 weather service + 3 行 input → 创建 External Skill → Skill 创建页自动渲染 3 个 textarea → LLM 调用 → 出站 query 校验）
- [ ] 16.7 验证 is_raw_transmission 两种值（天气 q is_raw=0 / 脚本 code is_raw=1）的出站 payload 差异
- [ ] 16.8 验证 admin 改子表（加 q2 行）后业务方 Skill 立即生效（无需重保存）
- [ ] 16.9 补 `api_call_log` 测试用例（验证 sensitive mask / LLM 误传 key 也落审计）
- [ ] 16.10 确认 `openspec/reviews/2026-06-23-add-external-service-skill.md` 是基于旧设计（`inputs[]` / `dynamicList` / `auth_value_static`）的 review，**与本次 change 不冲突**；仅作历史参考

## 17. 文档同步

- [ ] 17.1 确认最终设计稿 `docs/external-service-skill-design.md` 存在且内容最新（与本次 OpenSpec 一致）
- [ ] 17.2 在 `backend/skill-gateway/src/main/resources/schema-mysql.sql` 头部注释里注明"参考 `openspec/changes/add-external-service-skill/` 设计稿"

## 18. 部署与冒烟

- [ ] 18.1 部署到测试环境（`bxdc-mysql` 容器 + 3 服务）
- [ ] 18.2 admin 录入示例数据（参考 `docs/external-service-skill-design.md §4.7` 4 个场景的 INSERT 例子）
- [ ] 18.3 验证 GET `/api/external-service` 列表（admin 角色）
- [ ] 18.4 验证 GET `/api/external-service/weather-openweathermap/inputs` 公开读（任何已认证用户）
- [ ] 18.5 验证创建 kind=external Skill（只填 serviceName + interfaceDescription）
- [ ] 18.6 验证 Skill 创建页自动渲染 3 个 textarea（q / units / lang）
- [ ] 18.7 验证 LLM 调用 Skill → Gateway 出站到 OpenWeatherMap → 响应回 LLM
- [ ] 18.8 验证 dynamicToken 模式（带 cacheSeconds 缓存）
- [ ] 18.9 验证 is_raw_transmission=1 字段（脚本执行 / 飞书 content）原文透传
- [ ] 18.10 验证 disabled 服务执行时返回 400
