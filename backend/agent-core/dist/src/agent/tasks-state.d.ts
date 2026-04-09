import type { BaseMessage } from "@langchain/core/messages";
export type TaskStatusValue = "pending" | "in_progress" | "completed" | "cancelled";
export interface TaskState {
    label: string;
    status: TaskStatusValue;
    updatedAt: string;
}
export type TasksStatusMap = Record<string, TaskState>;
export declare const AgentAnnotation: import("@langchain/langgraph").AnnotationRoot<{
    tasks_status: import("@langchain/langgraph").BaseChannel<TasksStatusMap, TasksStatusMap | import("@langchain/langgraph").OverwriteValue<TasksStatusMap>, unknown>;
    messages: import("@langchain/langgraph").BaseChannel<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
}>;
export type AgentState = typeof AgentAnnotation.State;
export declare function rebuildTasksStatusFromMessages(messages: BaseMessage[]): TasksStatusMap;
export declare function buildTasksSummary(tasks: TasksStatusMap): string;
export declare function preModelHook(state: AgentState & {
    llmInputMessages?: BaseMessage[];
}): {
    tasks_status: TasksStatusMap;
    llmInputMessages: BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[];
};
