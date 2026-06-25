# Debug: skill-gateway 启动报错

**Session ID**: `skill-gateway-startup`
**Status**: [FIXED — 等用户确认]

## 根因（已证据确认 + 已修复）

启动期 `dataSourceScriptDatabaseInitializer` 抛 `IllegalStateException`：
```
No schema scripts found at location 'classpath:migration-add-esi-timestamps.sql'
```

来源：本机 `backend/skill-gateway/src/main/resources/application.properties`（gitignored）
```properties
spring.sql.init.schema-locations=classpath:schema-mysql.sql,classpath:migration-add-esi-timestamps.sql
```

`migration-add-esi-timestamps.sql` 在仓库里**从未存在过**（git log 全分支、仓库内文件搜索均零命中）。

## 修复（已应用）

按用户选项 A：从 `application.properties` 删掉那条引用
```diff
- spring.sql.init.schema-locations=classpath:schema-mysql.sql,classpath:migration-add-esi-timestamps.sql
+ spring.sql.init.schema-locations=classpath:schema-mysql.sql
```

## 验证（post-fix vs pre-fix 对比）

| 项 | pre-fix | post-fix |
|---|---|---|
| `IllegalStateException: No schema scripts found at 'classpath:migration-add-esi-timestamps.sql'` | ❌ 抛 | ✅ 消失 |
| `GET /api/health` | ❌ Bean 创建失败 | ✅ 200 `{"status":"ok","uptimeSeconds":44}` |

## 假设状态
| # | 假设 | 状态 |
|---|------|------|
| H1 | 我刚才改的 `Object scriptArgs = ...` 编译错误 | ❌ `mvn -o clean compile` BUILD SUCCESS |
| H2 | `application.properties` 没 cp | ❌ 本机有，且能连 MySQL |
| H3 | MySQL 容器没启动 | ❌ Hikari + 30+ 列 SchemaMigration 都跑过 |
| H4 | 端口 18080 被占用 | ❌ Tomcat 起来了 |
| H5 | `migration-add-esi-timestamps.sql` 缺失 | ✅ 命中 + 已修复 |

## 残留非致命噪音（**不属本次 debug 范围**，仅记录）

`FileToolSeeder` 启动时打印一批 `Duplicate entry 'excel_xxx' for key 'skills.name'` 错误，
但应用随后 health check 通过 = 这些是 seeder 自身的 check-then-insert race 引起的**非致命**异常
（`ApplicationRunner` 抛了异常被吞了？或上游 `try` 住了？需要再翻 seeder 实现确认）。
本次不展开，先请用户确认本次修复。

## 收尾待办
- [ ] 用户确认 fix OK 后，删 `debug-skill-gateway-startup.md`
- [ ] `application.properties` 改动不进 git（gitignored）
