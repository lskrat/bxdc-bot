export type ToolTraceStatus = "running" | "completed" | "failed";
export interface ToolTraceEvent {
    type: "tool_status";
    toolId: string;
    toolName: string;
    displayName: string;
    kind: "skill" | "tool";
    status: ToolTraceStatus;
    parentToolId?: string;
    parentToolName?: string;
    summary?: string;
    executionMode?: string;
    executionLabel?: string;
}
export declare function runWithToolTraceContext<T>(emit: (event: ToolTraceEvent) => void, work: () => Promise<T>): Promise<T>;
export declare function emitToolTraceEvent(event: ToolTraceEvent): void;
export declare function setActiveParentToolId(toolName: string, toolId: string): void;
export declare function clearActiveParentToolId(toolName: string, toolId?: string): void;
export declare function getActiveParentToolId(toolName: string): string | undefined;
