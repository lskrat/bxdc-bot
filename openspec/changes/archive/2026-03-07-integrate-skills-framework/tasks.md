## 1. Setup

- [x] 1.1 将 `src/skills` 代码迁移到 `backend/agent-core/src/skills`
- [x] 1.2 审计并在 `backend/agent-core/package.json` 中安装 skills 所需依赖

## 2. Core Implementation

- [x] 2.1 在 `backend/agent-core/src/skills/types.ts` 中实现 `Skill` 接口及类型
- [x] 2.2 实现 `SkillManager` 类，用于加载和注册 skills
- [x] 2.3 创建用于验证的 "Hello World" skill

## 3. Agent Integration

- [x] 3.1 更新 `Agent` 类，在 constructor/init 中接受 `SkillManager`
- [x] 3.2 修改 `Agent` 的 prompt 生成逻辑，纳入 skill 的 description/schema
- [x] 3.3 更新 `Agent` 的 tool 执行循环，支持 skill 调用

## 4. Verification

- [x] 4.1 验证 `SkillManager` 能加载测试 skill
- [x] 4.2 验证 Agent 能通过 LLM 交互「看到」并「调用」测试 skill
