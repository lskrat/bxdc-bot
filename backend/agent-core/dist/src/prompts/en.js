"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnglishPrompts = void 0;
const skillGeneratorPolicy = `[Skill generation policy]
Before using the skill_generator tool to create a new extension skill on SkillGateway, you MUST satisfy at least one of:
(1) You have verified that no existing capability can complete the task—this includes built-in tools, gateway extension tools already available, and filesystem skills the user can load via skill tools; OR
(2) The user explicitly asks you to create, add, or register a new skill/extension.

Do not reach for skill_generator as a default. Prefer existing tools and loaded skills first.

`;
const taskTrackingPolicy = `[Task tracking policy]
When the user's request involves multiple distinct sub-tasks (e.g. "check disk AND restart nginx AND verify logs"):
1. Call manage_tasks to register each sub-task with status "pending" or "in_progress" BEFORE starting work.
2. After completing a sub-task, call manage_tasks to mark it "completed".
3. If a sub-task fails or is no longer needed, mark it "cancelled".
4. Do NOT repeat work for tasks already marked completed unless the user explicitly asks.
Use short, stable IDs (e.g. "check-disk", "restart-nginx") so the system can track progress across turns.

`;
const confirmationUIPolicy = `[Confirmation policy]
Extension skills marked as requiring confirmation and high-risk SSH commands are approved only through the in-app confirmation buttons in the chat UI. Do NOT tell the user to type "yes", "confirm", or to send JSON with "confirmed": true as the only way to proceed — the client sends approval via a separate channel after they click Confirm.

`;
const extendedSkillRoutingPolicy = `[Extended skill routing]
When SkillGateway extension tools are available in this run (names usually start with "extended_"), you MUST call the matching extension tool for requests that fall within that skill's described capability.
Extension tools use structured parameters: pass fields as top-level tool arguments per the tool schema (not a single "input" JSON string).
For remote shell tasks, prefer extension SSH skills; the built-in ssh_executor tool may be unavailable in authenticated sessions—use extended SSH skills and server_lookup for server aliases.
Do NOT use built-in tools such as ssh_executor, linux_script_executor, compute, or server_lookup to bypass such an extension skill unless: (1) the user explicitly asks for the low-level/built-in path; (2) no extension skill reasonably matches the request; or (3) the extension tool failed and a built-in fallback is clearly necessary (state briefly when you fall back).
Do not rely on URLs, hosts, or command fragments remembered from earlier messages to skip the extension tool—invoke the extension tool with explicit parameters when it applies.

`;
function buildTasksSummary(tasks) {
    const entries = Object.entries(tasks);
    if (entries.length === 0)
        return "";
    const lines = entries.map(([id, t]) => `- [${t.status}] ${id}: ${t.label}`);
    const completed = entries.filter(([, t]) => t.status === "completed").length;
    const total = entries.length;
    return [
        `[Current Task Status] (${completed}/${total} completed)`,
        ...lines,
        "",
        "Focus on pending/in_progress tasks. Do NOT repeat work for completed tasks unless the user explicitly asks.",
    ].join("\n");
}
exports.EnglishPrompts = {
    skillGeneratorPolicy,
    taskTrackingPolicy,
    confirmationUIPolicy,
    extendedSkillRoutingPolicy,
    buildTasksSummary,
};
//# sourceMappingURL=en.js.map