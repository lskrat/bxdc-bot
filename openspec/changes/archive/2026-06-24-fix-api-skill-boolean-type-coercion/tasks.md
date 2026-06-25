## 1. 修改 SkillExecutionService.mergeDefaults()

- [x] 1.1 在 `SkillExecutionService.java` 中新增私有方法 `coerceByType(String key, Object value, String type)`，按 `design.md` Decision 2 的实现
- [x] 1.2 修改 `mergeDefaults(Object parameters, Map<String, Object> config)`，在 `merged.putAll(inputMap)` 之后、`return merged` 之前，新增对 merged map 按 `properties[*].type` 的强转循环
- [x] 1.3 保持 `parameterContract == null` 或 `properties == null` 的分支语义不变（向后兼容无契约 Skill）
- [x] 1.4 在 `coerceByType` 抛 `IllegalArgumentException` 前调 `log.warn(...)`，记录 skillId / userId / 参数名 / 实际值 / 期望类型，方便运维排查（skillId / userId 通过 `mergeDefaults` 调用栈获取：在 `executeApiSkill` 入口取 `request.skillId` / `request.userId`，作为参数传到 `coerceByType`，或在 `mergeDefaults` 抛错点捕获后 log）。**注意：抛错前 log，**不**吞掉异常**

注：实施时 `mergeDefaults` / `coerceByType` 实际签名新增 `Long skillId, String userId` 两个参数，调用点（[SkillExecutionService.java:145](file:///d:/IdeaProjects/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillExecutionService.java#L145)）已同步更新为 `mergeDefaults(effectiveParameters, config, skill.getId(), request.userId)`。

## 2. 单测覆盖

- [x] 2.1 新建 `backend/skill-gateway/src/test/java/com/lobsterai/skillgateway/service/SkillExecutionServiceTest.java`
- [x] 2.2 单测：boolean 入参 `"true"` / `"True"` / `"TRUE"` / `"yes"` / `"1"` / `" true "`（带空格）→ 强转为 `Boolean.TRUE`
- [x] 2.3 单测：boolean 入参 `"false"` / `"False"` / `"FALSE"` / `"no"` / `"0"` / `""` → 强转为 `Boolean.FALSE`
- [x] 2.4 单测：boolean 入参 `"abc"`（非法字符串）→ 抛 `IllegalArgumentException`，消息含字段名 + 实际值
- [x] 2.5 单测：boolean 入参非 Boolean 非 String（如 `Integer` / `Map`）→ 抛 `IllegalArgumentException`
- [x] 2.6 单测：integer 入参 `"42"` → 强转为 `Long(42)`
- [x] 2.7 单测：integer 入参 `"abc"` → 抛 `IllegalArgumentException`
- [x] 2.8 单测：number 入参 `"0.75"` → 强转为 `Double(0.75)`
- [x] 2.9 单测：boolean 入参已经是 `Boolean.TRUE` → 原样保留
- [x] 2.10 单测：boolean 入参 `null` → 原样保留 `null`
- [x] 2.11 单测：`default: "true"`（字符串形式的 default）→ 强转 `Boolean.TRUE`
- [x] 2.12 单测：Skill 无 `parameterContract` → 行为不变（仅做 default/const 兜底，不强转）
- [x] 2.13 单测：property 未声明 `type`（简化描述格式 `{"name": "用户 ID"}`）→ 字符串 `"true"` 原样保留，**不**强转、**不**抛错
- [x] 2.14 单测：property `type` 显式为 `null` 或空串 → 原样保留
- [x] 2.15 单测：property `type` 为 `"object"` / `"array"` → 嵌套 Map 原样保留，**不**做递归强转

注：实施时用反射调 private 方法（mergeDefaults / coerceByType），保留封装、不改可见性。`spring-boot-starter-test` 已传递依赖 JUnit 5 (Jupiter)，无需新增 Maven 依赖。

## 3. 编译与回归验证

- [x] 3.1 跑 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml compile` 验证编译通过
- [x] 3.1.1（额外）跑 `mvn test-compile` 验证单测代码也编译通过
- [x] 3.2 跑 `./apache-maven-3.8.5/bin/mvn -s ./settings.xml test -Dtest=SkillExecutionServiceTest` 验证全部单测通过（**29/29 通过**）
- [ ] 3.3 重启 skill-gateway（`./apache-maven-3.8.5/bin/mvn -s ./settings.xml spring-boot:run`）— 需要外部 MySQL，用户后续手动验证
- [ ] 3.4 手动验证：构造一个 contract 含 `enabled: {type: "boolean"}` 的 API Skill，传入 `{"enabled": "true"}`，确认下游接口收到的 query/body 是 boolean 而非字符串 — 用户手动验证

**实施期间发现并修复预存在 bug**：
§2.13 单测（`{"name": "用户 ID"}` 简化描述格式）暴露 `mergeDefaults` 预存在的 ClassCastException——原 default/const 提取循环 `Map<String, Object> propDef = (Map<String, Object>) entry.getValue(); if (propDef != null) propDef.containsKey(...)` 会因 value 是 String 而抛 ClassCastException。已在 default/const 循环和新加的强转循环都加 `instanceof Map` 守卫（参见 [SkillExecutionService.java:184-191](file:///d:/IdeaProjects/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillExecutionService.java#L184-L191) 和 [SkillExecutionService.java:203-209](file:///d:/IdeaProjects/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillExecutionService.java#L203-L209)），简化描述格式的 property 不再 crash。这与 spec §"property 未指定 type 时原样保留（保守契约）"一致。

注：实施时本地无 `apache-maven-3.8.5/`，用系统 mvn 3.9.16（AGENTS.md 2.4 注明 3.9.x 项目内 .m2 兼容）。

## 4. 文档与归档

- [x] 4.1 更新 `CHANGELOG-v2.4.0.md`（或新建 CHANGELOG 文件）记录本次变更 + 「如果下游意外接受字符串 boolean 请改契约为 string」兼容性提示
- [x] 4.2 跑 `npx openspec status --change fix-api-skill-boolean-type-coercion` 确认所有 artifact 完成（`isComplete: true`，validate strict 通过）
- [x] 4.3 ~~归档~~ **暂不归档**（用户决策 2026-06-24：保持当前状态留作 ongoing change，待手动验证 3.3/3.4 后再归档）

## 5. 后续手动动作（用户执行）

- [ ] 5.1 重启 skill-gateway：`(cd backend/skill-gateway && mvn -s ./settings.xml spring-boot:run)`
- [ ] 5.2 e2e 手动验证：构造一个 contract 含 `enabled: {type: "boolean"}` 的 API Skill，传入 `{"enabled": "true"}`，确认下游接口收到的 query/body 是 boolean 而非字符串
- [ ] 5.3 验证通过后跑 `npx openspec archive fix-api-skill-boolean-type-coercion` 完成归档