import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const taskUpdateSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "Stable task identifier. Use a short slug like 'check-disk', 'restart-nginx'. " +
        "Reuse the same id to update an existing task.",
    ),
  label: z
    .string()
    .describe("Brief human-readable description of the task"),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe("New status for this task"),
  result: z
    .record(z.any())
    .optional()
    .describe("Optional result data from task execution. " +
      "When marking a task as completed, include the key results (e.g., { fileId: 80, fileName: 'result.xlsx' }) " +
      "so that subsequent tasks can reference this data."),
});

const manageTasksInputSchema = z.object({
  updates: z
    .array(taskUpdateSchema)
    .min(1)
    .describe(
      "One or more task status updates. Create new tasks or update existing ones.",
    ),
});

export class ManageTasksTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: "manage_tasks",
      description:
          "Track multi-step work progress and register/update sub-tasks. " +
          "Use short stable IDs (e.g. 'check-disk'). " +
          "Call this to register new sub-tasks with pending/in_progress status, or mark them completed/cancelled. " +
          "When marking a task as completed, include result data (fileId, statistics, etc.) so subsequent tasks can reference it. " +
          "Hint: Set status to pending/in_progress before execution and completed afterward; the system skips finished tasks automatically to avoid duplicate work and focus on remaining items.",
      schema: manageTasksInputSchema,
      func: async (input: z.infer<typeof manageTasksInputSchema>) => {
        const lines = input.updates.map(
          (u) => {
            let line = `  ${u.id}: ${u.status} — ${u.label}`;
            if (u.result && Object.keys(u.result).length > 0) {
              line += `\n    Result: ${JSON.stringify(u.result)}`;
            }
            return line;
          },
        );
        return `Task status updated:\n${lines.join("\n")}`;
      },
    });
  }
}
