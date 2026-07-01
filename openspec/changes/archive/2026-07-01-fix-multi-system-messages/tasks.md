## Tasks

- [x] 重构 `agent.controller.ts` 消息构造：system 只放 profileDetails + 兜底话术，其余移至 user 消息
- [x] 改造 `tasks-state.ts` preModelHook：合并任务摘要到已有 system 消息，不新增
- [x] 移除 `tasks-state.ts` 中不再需要的 `SystemMessage` import
- [x] 添加 system 消息兜底话术（profileDetails 为空时）
