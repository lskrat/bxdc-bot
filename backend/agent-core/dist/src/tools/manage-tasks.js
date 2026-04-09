"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManageTasksTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const taskUpdateSchema = zod_1.z.object({
    id: zod_1.z
        .string()
        .min(1)
        .describe("Stable task identifier. Use a short slug like 'check-disk', 'restart-nginx'. " +
        "Reuse the same id to update an existing task."),
    label: zod_1.z
        .string()
        .describe("Brief human-readable description of the task"),
    status: zod_1.z
        .enum(["pending", "in_progress", "completed", "cancelled"])
        .describe("New status for this task"),
});
const manageTasksInputSchema = zod_1.z.object({
    updates: zod_1.z
        .array(taskUpdateSchema)
        .min(1)
        .describe("One or more task status updates. Create new tasks or update existing ones."),
});
class ManageTasksTool extends tools_1.DynamicStructuredTool {
    constructor() {
        super({
            name: "manage_tasks",
            description: "Track the progress of multi-step work. " +
                "Call this to register new sub-tasks (status=pending/in_progress) or mark them completed/cancelled. " +
                "The system uses this to avoid repeating finished work and to keep you focused on remaining items.",
            schema: manageTasksInputSchema,
            func: async (input) => {
                const lines = input.updates.map((u) => `  ${u.id}: ${u.status} — ${u.label}`);
                return `Task status updated:\n${lines.join("\n")}`;
            },
        });
    }
}
exports.ManageTasksTool = ManageTasksTool;
//# sourceMappingURL=manage-tasks.js.map