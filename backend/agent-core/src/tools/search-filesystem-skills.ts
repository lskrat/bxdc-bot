/**
 * Filesystem Skill 搜索工具模块
 *
 * open spec: optimize-agent-prompt-and-skill-mounting
 *
 * 模块职责：
 * - 在主 Agent 内置 search_filesystem_skills 工具，按 query 检索 ./SKILLs/ 下的 SKILL.md
 * - 返回 {id, name, description, score} 列表（与 SkillManager.searchSkills 一致）
 * - 主 Agent 拿到结果后用 execute_skill_with_context(skillIds=[id]) 加载并执行
 *
 * 与 SearchToolsTool 的区别：
 * - search_tools 检索 gateway 系统技能（owner_type=2，HTTP 拉取）
 * - search_filesystem_skills 检索本地 filesystem skills（直接读 SKILL.md，无网络）
 *
 * @module SearchFilesystemSkills
 * @author Agent Core Team
 * @since 1.0.0
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SkillManager } from "../skills/skill.manager";

const searchFilesystemSkillsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("The user's task description to search for relevant filesystem skills."),
});

/**
 * Filesystem Skill 搜索工具（内置名：`search_filesystem_skills`）
 *
 * 在 ./SKILLs/ 目录中按关键词模糊匹配 SKILL.md 文件，返回带 score 的技能列表。
 * 命中后用 execute_skill_with_context(skillIds=[id], instruction=...) 创建子 Agent 执行。
 */
export class SearchFilesystemSkillsTool extends DynamicStructuredTool<typeof searchFilesystemSkillsInputSchema> {
  constructor(private readonly skillManager: SkillManager) {
    super({
      name: "search_filesystem_skills",
      description:
        "Search ./SKILLs/ by query. Returns { status, skills: [{id, name, description, score}] }. " +
        "After results, pass the chosen id to execute_skill_with_context.skillIds to load and run it.",
      schema: searchFilesystemSkillsInputSchema,
      func: async (args) => {
        try {
          const matches = this.skillManager.searchSkills(args.query);
          if (matches.length === 0) {
            return JSON.stringify({
              status: "NO_SKILLS_FOUND",
              message: "No filesystem skills matched the query (or no SKILL.md files configured).",
              skills: [],
            });
          }
          return JSON.stringify({
            status: "SUCCESS",
            message: `Found ${matches.length} filesystem skill(s)`,
            skills: matches,
          });
        } catch (error) {
          return JSON.stringify({
            status: "ERROR",
            message: `Error searching filesystem skills: ${error instanceof Error ? error.message : String(error)}`,
            skills: [],
          });
        }
      },
    });
  }
}