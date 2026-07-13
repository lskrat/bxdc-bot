# AGENTS.md — bxdc-bot 项目 AI agent 工作规则

> 写给以后接手这个项目的 AI agent（或断点重启后的我自己）的工作约定。
> 补充项目本身不具备、但需要长期记住的上下文。

---

## 1. 部署规则 ⚠️ 最重要

**dist/ 已被 .gitignore 排除（commit c5d6ff3 之后）**。

- `frontend/dist/` 和 `backend/agent-core/dist/` **不进 git**
- `application.properties` **不进 git**（用 `.example` 模板 + 各人 cp）
- 部署/同事 clone 下来**自己 `npm run build` 生成 dist**

### 工作流

**本地开发（不需要 dist）：**
```bash
# 启动 3 个服务（都走源码，不走 dist）
cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml spring-boot:run
cd backend/agent-core && npm run start:dev   # nest start --watch 走 ts-node
cd frontend && npm run dev                    # Vite 实时编译
```

### 提交源码时
- **只 commit 源码**（`frontend/src/`、`backend/agent-core/src/`、`backend/skill-gateway/src/main/java/`、OpenSpec、`.md`、`.gitignore` 等）
- **不 commit dist 产物**
- 跑 `git status` 确认没把 `dist/` 误带进来

---

## 2. 本地开发配置

### 数据库
- `backend/skill-gateway/src/main/resources/application.properties` **已 gitignore**
- 首次启动 cp 模板 + 改 MySQL 密码：
  ```bash
  cp backend/skill-gateway/src/main/resources/application-prod.example.properties \
     backend/skill-gateway/src/main/resources/application.properties
  # 改 password= 为本机 MySQL root 密码
  ```
- MySQL 跑在 Docker 容器 `bxdc-mysql`（端口 3306）

### 服务端口
- skill-gateway: 18080 / agent-core: 3000 / frontend: 5173 / MySQL: 3306

### 一键启动（3 个服务，3 个 terminal）
```bash
(cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml spring-boot:run)  # 必须 cd
cd backend/agent-core && npm run start:dev
cd frontend && npm run dev
```

### ⚠️ 启动 mvn 前必须 `cd backend/skill-gateway`（强警告）

`settings.xml` 的 `<localRepository>.m2/repository</localRepository>` 是**相对路径**，解析为 mvn 进程的工作目录（cwd）。cwd 跑偏会在错误位置生成 .m2。AI agent 必须用 `bash -c 'cd ... && mvn ...'` 或 subshell，把 `cd` 一起带上（nohup mvn 时 mvn 进程继承父 shell 的 cwd，相对路径仍按 mvn 进程的 cwd 解析）。

`.m2/` 目录不进 git（本地缺包 mvn 会从 aliyun mirror 补全；内网部署拷 `~/Desktop/m2-offline-bundle.tar.{xz,gz,zst}` 解压到 `backend/skill-gateway/.m2/` 即可，**不要**加 `-o`）。

---

## 3. OpenSpec 工作流

每次有"功能/改动/归档"需求，遵循 OpenSpec 规约。

- 归档时如果报 `REMOVED failed for header "X" - not found`：原 spec 里没有这条 requirement，不能 REMOVE。删掉 `## REMOVED Requirements` 段，只保留 `## ADDED Requirements`。
- 归档产物落在 `openspec/changes/archive/YYYY-MM-DD-<name>/`。
- 主 spec 落地在 `openspec/specs/<capability>/spec.md`。

---

## 4. 异步任务系统（项目核心特性）

5 个原子 + 2 种模式：

| 原子 | 职责 |
|------|------|
| Submit | gateway 同步收一次 third-party，拿到 externalTaskId |
| Wait  | 客户端轮询 gateway 拿结果 |
| Audit | 写 `async_polling_audit_log` 记每步 phase |
| Dedup | SHA-256 签名 per-session 1h + no-session 60s 窗口去重 |
| Notify | 任务完成推前端通知中心（`/api/async-tasks/my`）|

**两种模式都走 fire-and-forget 立即返回**（不再阻塞 LLM）：
- `SINGLE_CALL`（单次长调用）：agent-core 提交完立即返回 `status: SINGLE_CALLED`
- `PERIODIC`（带 `pollEndpoint` 的轮询）：agent-core 提交完立即返回 `status: POLLING`

主 spec：`openspec/specs/api-extension-skill-llm-tool-call/spec.md`

---

## 5. 编程约束规范

团队代码规范，遵循这 5 条：

### 5.1 尽量不新增第三方包
- 新增第三方包意味着 supply chain 风险 + 依赖升级成本 + 团队学习成本
- 优先用 JDK 1.8 / NestJS 11 / Vue 3 / Spring Boot 2.7 自带的标准库
- 必须新增时需要评审：能不能用现有工具实现？有没有轻量级替代？

### 5.2 尽量不要新增环境变量配置
- 新的 env 变量意味着部署同事多配一项、新同事上手成本高
- 优先用代码内的合理默认值 + 配置文件覆盖
- 必须新增时需要用户明确要求，且要有默认值兜底

### 5.3 涉及数据库表操作可以使用 Java 代码做，尽量不增量运行 SQL 文件
- schema 变更优先用 Flyway / Liquibase 或 Spring Data JPA 自动 ddl，或者 `schema-mysql.sql` 一次性初始化（Spring `spring.sql.init.mode=always` 自动跑）
- **不要**在多个增量 commit 里改 `schema-mysql.sql` 让用户手动 `mysql -e "..."` 跑
- 复杂 schema 变更（加索引 / 改字段类型 / 数据迁移）走 Java migration 类（参考 `StartupRecoveryRunner` 模式）

#### ⚠️ 给已有表加列：必须同步写 `SchemaMigrationRunner` 幂等迁移（强警告）

`schema-mysql.sql` 用的是 `CREATE TABLE IF NOT EXISTS`，**只对「不存在的表」按完整定义建表，对「已存在的表」既不重建也不补列**。因此：

- **只改实体 `@TableField` + 改 `schema-mysql.sql` 的 CREATE TABLE 是不够的**。空库环境正常（新建表带新列），但**已有旧表的环境（同事/部署/老库）启动会报 `Unknown column 'xxx' in 'field list'`**——查询用到了新列，而旧表没这列。
- **新增/修改列时，MUST 同步在 `SchemaMigrationRunner` 对应的 `migrateXxx()` 里加一条幂等 `ALTER TABLE ... ADD COLUMN`（及必要的 `ensureIndex`）**，用 `ensureColumn(conn, table, "列名", existingColumns, "ALTER ...")` 模式（已存在则跳过）。`SchemaMigrationRunner` 是 `HIGHEST_PRECEDENCE` 的 `InitializingBean`，在所有 `ApplicationRunner`（如 `FileToolSeeder`）之前执行，保证查询前列已就绪。
- **自查 checklist**（给任何表加列后跑一遍）：
  1. 实体 `@TableField` 加了列 ✓
  2. `schema-mysql.sql` 的 CREATE TABLE 加了列（空库路径）✓
  3. `SchemaMigrationRunner.migrateXxx()` 加了幂等 `ensureColumn`（旧库路径）✓ ← **最易漏，必查**
  4. 列若进入 Mapper 的 SELECT 列表，对照确认该表所有「后期新增列」都已在迁移里覆盖
- 教训来源：`team_id`、`intro_md` 两列只改了实体与 CREATE TABLE 却漏了 `migrateSkills` 迁移，导致旧库启动 `Unknown column` 连环报错。

### 5.4 Java 版本与 language level 必须保持 JDK 1.8
- 编译目标统一为 **JDK 1.8**（`pom.xml` 的 `<java.version>1.8</java.version>` 与 `maven-compiler-plugin` 的 `source/target` 同步）
- IntelliJ Project language level 必须设为 **8 - Lambdas, type annotations etc.**（与 JDK 1.8 严格对应）
  - 不要选 `11 - Local variable syntax for lambda parameters`、`14 - Switch expressions` 等更高 level
  - 不要选 `7 - Diamonds, ARM, multi-catch etc.`（过老，缺 type annotations）
- 代码里**禁止**出现 `var`、Records、`sealed interface`、`switch` 表达式（Java 14+ 特性）、`instanceof` 模式匹配（Java 16+）、text block `"""`（Java 13+ preview / Java 15+ GA）等高版本语法
- 如果用到了 JDK 1.8 不支持的新 API（例如 `List.of(...)` 是 Java 9+、`var` 是 Java 10+），需要**降级**到 1.8 兼容写法（如 `Arrays.asList(...)`、显式类型）
- 升级 JDK 需要团队评审 + 同步修改 IDEA 项目 language level + 更新本规约

### 5.5 新功能架构约束：不改 agent-core，走 Tool 接入 + Schema 动态渲染
- **尽量不修改 agent-core（NestJS）代码**：agent-core 作为 LLM 调度层应保持稳定，新增能力优先在 gateway（Java）侧以 Tool 形式接入
- **新能力 = 新 Skill 类型**：参照 `api`（API 代理）、`ssh`（SSH 执行）的模式，在 `SystemSkillController.buildXxxConfigSchema()` 中定义配置 schema，在 gateway 侧实现执行逻辑
- **Skill 编辑页用 Schema 驱动动态渲染**：`ConfigFormRenderer` 基于后端 `/api/system-skills/execution-types` 返回的 `configSchema` 动态渲染表单，新增 Skill 类型只需扩展后端 schema + ConfigFormRenderer 的 UI 类型支持（如 checkbox / radio 等），**不要**在 `SkillManagementModal.vue` 中为每种类型硬编码模板
- **如需修改 agent-core（基础能力级别变更）**：如果需求确实无法通过 gateway Tool 接入实现（如修改 LLM 调度策略、tool-call 协议、SSE 通信机制等基础能力），必须在 OpenSpec proposal + design 中**明确说明**：
  - 为什么不能走 Tool 接入？（技术瓶颈在哪）
  - 对 agent-core 哪些模块有影响？（具体文件 / 类 / 函数）
  - 对现有 Skill 类型的兼容性影响？（是否破坏已有 api / ssh / template / openclaw 的行为）
  - 是否需要 agent-core 单独回归测试？
  以便开发人员评估是否接受这次架构侵入

### 5.6 前端 build 必须零 TS6133（vue-tsc -b 严格模式）
- `frontend/package.json` 的 `build` 脚本是 `vue-tsc -b && vite build --skipTypeCheck`，**先跑 vue-tsc -b（严格 build mode）再跑 vite**。vue-tsc -b 严格模式会报 TS6133（声明但未使用），一旦有 TS6133 整个 build 立即 exit code 2，**不进入 vite 阶段**
- 重构 / 删字段 / 改 composable 解构后 MUST 自查所有未用 declaration，**不能用 `vue-tsc --noEmit` 蒙混过关**（单文件模式比 -b 宽松，可能漏报；CI / 同事 build 才会触发）
- 常见触发点（已踩过）：
  - 从 composable 解构出来的方法 / ref（如 `useAsyncTaskNotifications` 的 `deleteTask`）
  - 写了但没在 template 引用的 computed（如 `childCountByParent`）
  - 写了但没在 script 调用的辅助函数（如 `hasParentContext`、`formatToolSummary`）
  - 删字段后没删对应 import
- **自查 checklist**（重构后跑一遍）：
  1. `cd frontend && npx vue-tsc -b` 必须静默通过（无输出）
  2. `cd frontend && npm run build` 必须 exit 0
  3. 关注 vite 输出的 chunk size warning（如新增大依赖需说明）
- 教训来源：commit `53def51` 一次性删了 4 处 TS6133 declaration 才让 build 通过；之前 `vue-tsc --noEmit` 不报，但 `vue-tsc -b` 必报

### 5.7 agent-core 新增接口必须统一以 `/agent` 开头
- agent-core（NestJS）对外暴露的 HTTP 端点**必须**以 `/agent` 为路径前缀（如 `/agent/run`、`/agent/confirm`），**禁止**新增其他顶层路径前缀
- 原因：`frontend/vite.config.ts` 已配置 `/agent → http://127.0.0.1:3000` 的代理规则，新增 `/agent/*` 路径无需改 proxy 配置即可生效；若新增其他前缀（如 `/memory`、`/tool/*`），则必须在 vite.config.ts 中逐条新增 proxy 规则，增加代理配置的维护成本
- **例外**：已有非 `/agent` 前缀的端点（如 `/memory` proxy 规则）可保留，但不再新增此类例外
