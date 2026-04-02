## 1. 数据与 API

- [x] 1.1 设计并添加用户级 `disabled_skill_ids` 持久化（字段或侧表），默认空表示无禁用
- [x] 1.2 实现 `GET` 当前用户 Skill 可用性（返回禁用 id 列表及/或可发现 Skill 元数据）
- [x] 1.3 实现 `PATCH`（或 `PUT`）更新当前用户禁用列表，校验鉴权与输入规范化
- [x] 1.4 确保匿名/未认证调用读写接口被拒绝；为上述接口补充集成测试或契约测试（实现：`PUT`/`GET` 对不存在用户 404；`UserSkillAvailabilityControllerTest`；与 LLM 设置相同的路径 `userId` 信任模型）

## 2. agent-core 运行时

- [x] 2.1 在**带 `userId`** 的任务上下文中加载对应禁用集合；无 `userId` 时不应用用户级过滤
- [x] 2.2 在**可配置（非文件系统）** Skill 的注册/组装路径上过滤工具输出，排除禁用 id；**不**对磁盘 `SKILL.md` Skill 应用 `disabled_skill_ids`
- [x] 2.3 同步过滤系统消息中与可配置 Skill 相关的摘要及兼容模式工具目录序列化，保证与 native tools 一致
- [x] 2.4 处理未知 id 的容错与日志；补充单元测试覆盖过滤、默认「可配置子集全部可用」与文件系统 Skill 不受影响

## 3. 前端

- [x] 3.1 新增或扩展设置页：Skill 列表 + 开关/多选，对接读取与保存 API
- [x] 3.2 处理加载中、错误与未登录态
- [x] 3.3 手动验证：禁用后新任务中模型侧 tools 与（开启兼容模式时）系统 prompt 均不含该项（操作员在本地登录后于设置页切换开关并发起新任务核对）

## 4. 文档与规范落地

- [x] 4.1 将本 change 的 specs 在实现完成后通过 archive 流程合并入 `openspec/specs/`
- [x] 4.2 更新面向部署/运维的简要说明（若有环境变量或迁移脚本）（见 `docs/mac-local-verify-deploy.md` §8.4）
