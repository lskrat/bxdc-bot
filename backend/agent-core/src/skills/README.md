# Skills Integration

这个目录现在承载了应用里 skills 的主要实现，而不只是“桥接代码”。目标是：

- 让 skills 的真实实现尽量都留在 `src/skills/`
- 让宿主项目外部只保留很薄的接线层
- 让别的项目复制这个目录时，只需要在 `skills` 目录内部做少量适配，而不用全项目搜改 import

## 目录结构

- `shared/types.ts`
  负责 skills 的共享类型定义。渲染层展示、IPC 返回值、技能市场数据结构都优先从这里取类型。
- `index.ts`
  对外总入口，方便别的项目直接从 `src/skills` 暴露能力。
- `main/deps.ts`
  主进程适配层。这里统一收口 `SqliteStore`、文件复制、Python runtime、Electron Node runtime 等宿主依赖。
- `main/skillManager.ts`
  Skills 主进程核心实现。负责发现技能、读取 `SKILL.md`、下载、删除、开关、配置、测试邮箱技能、构建自动路由 prompt。
- `main/serviceManager.ts`
  Skills 后台服务实现。当前主要负责 `web-search` 之类技能的后台服务启动与健康检查。
- `main/registerSkillIpc.ts`
  主进程 skills IPC 注册入口。`main.ts` 不再直接展开写所有 `skills:*` handler，而是从这里注册。
- `main/prompt.ts`
  主进程里与 skill prompt 生命周期有关的辅助函数，目前用于 follow-up 时裁剪自动路由大段 prompt。
- `renderer/service.ts`
  渲染层的 skills 业务服务。封装 `window.electron.skills.*` IPC 调用，以及本地缓存、市场描述多语言映射等逻辑。
- `renderer/skillSlice.ts`
  Redux 状态切片。维护已安装 skills 和当前会话选中的 `activeSkillIds`。
- `renderer/prompt.ts`
  手动选中 skill 后，给 Cowork 追加 skill prompt 的拼装逻辑。
- `renderer/i18n.ts`
  Skills 内部自己的文案与语言适配层。支持默认内置文案，也支持宿主项目注入自己的 `t/getLanguage`。
- `renderer/marketplace.ts`
  技能市场地址适配层。默认给出一套可工作的 URL，也支持宿主项目注入自己的 URL resolver。
- `renderer/components/`
  Skills 自己的 UI 组件，包括技能按钮、弹层、管理页、邮箱技能配置等。
- `preload.ts`
  预加载层的 skills bridge，统一 `ipcRenderer.invoke/on` 的暴露方式。

## 当前接入链路

1. 主进程启动时创建 `SkillManager` / `SkillServiceManager`，同时通过 `main/registerSkillIpc.ts` 注册 skills IPC。
2. `preload.ts` 通过 `buildSkillsPreloadBridge()` 把安全的 `window.electron.skills` API 暴露给渲染层。
3. 渲染层通过 `renderer/service.ts` 调 skills IPC，`renderer/skillSlice.ts` 负责 UI 状态。
4. 用户手动选择技能时，`renderer/prompt.ts` 会把 skill 的 `SKILL.md` 内容包装成内联 prompt，交给 Cowork 会话。
5. 用户没有手动选择技能时，主进程会走 `SkillManager.buildAutoRoutingPrompt()` 自动生成 `<available_skills>` 路由块；follow-up 阶段再通过 `main/prompt.ts` 做裁剪，避免 prompt 过大。

## 和 `SKILLs/` 的区别

- `SKILLs/`：真正的技能内容、脚本、资源、配置。
- `src/skills/`：应用内部的 skills 接入代码，负责发现、暴露、选择、拼接、调用这些技能。

## 可移植性设计

为了满足“复制这个目录到别的项目也能接入”的目标，这里做了两层处理：

- 真正实现尽量都在 `src/skills/`，宿主项目原路径现在大多只是 re-export 或轻量配置。
- 需要和宿主耦合的地方，尽量收口成 `skills` 目录内部的适配点，而不是散落在全项目。

当前主要适配点：

- `main/deps.ts`
  宿主项目主进程依赖入口。迁移到别的项目时，优先改这里。
- `renderer/i18n.ts`
  如果宿主有自己的国际化系统，可以通过 `configureSkillI18n()` 注入。
- `renderer/marketplace.ts`
  如果宿主有自己的技能市场地址策略，可以通过 `configureSkillStoreUrlResolver()` 注入。

## 宿主项目里保留的薄接线

- `src/main/skillManager.ts`
- `src/main/skillServices.ts`
- `src/renderer/services/skill.ts`
- `src/renderer/store/slices/skillSlice.ts`
- `src/renderer/types/skill.ts`
- `src/renderer/components/skills/*`

这些文件现在主要是兼容旧路径，方便现有项目不一次性改完所有 import。复制到新项目时，可以不复制这批旧路径文件，直接使用 `src/skills/` 里的实现。

## 迁移到别的项目

建议最少按下面几步接入：

1. 复制整个 `src/skills/` 目录。
2. 在宿主主进程里创建 `SkillManager` / `getSkillServiceManager()`，并调用 `registerSkillIpcHandlers()`。
3. 在宿主 preload 里把 `buildSkillsPreloadBridge(ipcRenderer)` 暴露到 `window.electron.skills`。
4. 在宿主渲染层 store 里挂载 `renderer/skillSlice.ts` 的 reducer。
5. 在宿主业务里按需使用 `renderer/service.ts`、`renderer/prompt.ts` 和 `renderer/components/*`。
6. 如果宿主有自己的存储、国际化或市场地址规则，优先改 `main/deps.ts`、`renderer/i18n.ts`、`renderer/marketplace.ts`。

## 修改建议

- 如果你要加一个新的 skills IPC 能力，优先改 `main/registerSkillIpc.ts`、`preload.ts`、`renderer/service.ts` 这三处。
- 如果你要改手动技能注入 Cowork 的 prompt 格式，优先改 `renderer/prompt.ts`。
- 如果你要改技能列表选择/激活状态，优先改 `renderer/skillSlice.ts`。
- 如果你要改 skills 元数据发现、下载、启停、依赖修复，优先改 `main/skillManager.ts`、`main/serviceManager.ts`。
- 如果你要把这一套搬到别的项目，建议从 `src/skills/index.ts` 开始接入，然后按需实现 `main/deps.ts`、`renderer/i18n.ts`、`renderer/marketplace.ts` 的宿主适配。
