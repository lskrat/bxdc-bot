"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChinesePrompts = void 0;
const skillGeneratorPolicy = `[技能生成策略]
在使用 skill_generator 工具在 SkillGateway 上创建新的扩展技能之前，你必须满足以下至少一个条件：
(1) 你已确认现有能力无法完成该任务——这包括内置工具、已可用的 Gateway 扩展工具，以及用户可以通过技能工具加载的文件系统技能；或者
(2) 用户明确要求你创建、添加或注册一个新技能/扩展。

不要将 skill_generator 作为默认选择。优先使用现有的工具和已加载的技能。

`;
const taskTrackingPolicy = `[任务跟踪策略]
当用户的请求涉及多个不同的子任务时（例如"检查磁盘 AND 重启 nginx AND 查看日志"）：
1. 在开始工作之前，调用 manage_tasks 将每个子任务注册为"待处理"或"进行中"状态。
2. 完成子任务后，调用 manage_tasks 将其标记为"已完成"。
3. 如果子任务失败或不再需要，将其标记为"已取消"。
4. 不要重复执行已标记为已完成的任务，除非用户明确要求。
使用简短、稳定的任务 ID（例如"check-disk"、"restart-nginx"），以便系统能够在多轮对话中跟踪进度。

`;
const confirmationUIPolicy = `[确认策略]
标记为需要确认的扩展技能和高风险 SSH 命令只能通过聊天 UI 中的应用内确认按钮进行审批。不要告诉用户输入"yes"、"confirm"，或发送带有"confirmed": true 的 JSON 作为唯一的继续方式——客户端会在用户点击确认后通过独立通道发送审批。

`;
const extendedSkillRoutingPolicy = `[扩展技能路由策略]
当本次运行中 SkillGateway 扩展工具可用时（名称通常以"extended_"开头），对于落在该技能描述能力范围内的请求，你必须调用匹配的扩展工具。
扩展工具使用结构化参数：按照工具模式将字段作为顶层工具参数传递（而不是单个"input" JSON 字符串）。
对于远程 shell 任务，优先使用扩展 SSH 技能；内置的 ssh_executor 工具在认证会话中可能不可用——请使用扩展 SSH 技能和 server_lookup 来查找服务器别名。
除非满足以下条件，否则不要使用 ssh_executor、linux_script_executor、compute 或 server_lookup 等内置工具来绕过此类扩展技能：(1) 用户明确要求使用低层级/内置路径；(2) 没有扩展技能合理地匹配该请求；或 (3) 扩展工具失败且内置回退明显必要（简要说明回退原因）。
不要依赖之前消息中记住的 URL、主机或命令片段来跳过扩展工具——当扩展工具适用时，使用明确的参数调用它。

`;
const statusMap = {
    pending: "待处理",
    in_progress: "进行中",
    completed: "已完成",
    cancelled: "已取消",
};
function buildTasksSummary(tasks) {
    const entries = Object.entries(tasks);
    if (entries.length === 0)
        return "";
    const lines = entries.map(([id, t]) => `- [${statusMap[t.status] || t.status}] ${id}: ${t.label}`);
    const completed = entries.filter(([, t]) => t.status === "completed").length;
    const total = entries.length;
    return [
        `[当前任务状态] (${completed}/${total} 已完成)`,
        ...lines,
        "",
        "专注于待处理/进行中的任务。除非用户明确要求，否则不要重复执行已完成的任务。",
    ].join("\n");
}
exports.ChinesePrompts = {
    skillGeneratorPolicy,
    taskTrackingPolicy,
    confirmationUIPolicy,
    extendedSkillRoutingPolicy,
    buildTasksSummary,
};
//# sourceMappingURL=zh.js.map