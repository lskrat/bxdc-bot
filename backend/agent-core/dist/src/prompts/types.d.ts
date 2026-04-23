export type TaskStatusValue = "pending" | "in_progress" | "completed" | "cancelled";
export interface TaskState {
    label: string;
    status: TaskStatusValue;
    updatedAt: string;
}
export type TasksStatusMap = Record<string, TaskState>;
export interface SystemPrompts {
    skillGeneratorPolicy: string;
    taskTrackingPolicy: string;
    confirmationUIPolicy: string;
    extendedSkillRoutingPolicy: string;
    buildTasksSummary: (tasks: TasksStatusMap) => string;
}
