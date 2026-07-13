/**
 * 系统提示词主入口模块
 *
 * @module PromptsIndex
 * @author Agent Core Team
 * @since 1.0.0
 */

import type { SystemPrompts, TasksStatusMap } from "./types";
import { EnglishPrompts, EnglishPromptHints } from "./en";
import { ChinesePrompts, ChinesePromptHints } from "./zh";

// 缓存变量
let cachedPrompts: SystemPrompts | null = null;
let cachedHints: { taskTrackingHint: string; confirmationHint: string; downloadUrlHint: string } | null = null;
let cachedLang: string | null = null;
let loggedBuiltPromptOnce = false;

export type PromptLevel = "short" | "full";

/**
 * 解析 AGENT_PROMPT_LEVEL 环境变量，返回合法值。
 *
 * open spec: optimize-agent-prompt-and-skill-mounting
 * - `short` (default): 只拼核心 4 段策略（agentRole + skillDiscovery + skillGenerator + extendedSkillRouting）
 * - `full`: 旧行为，拼完整 7 段（用于内网环境紧急回退 / 调试）
 * - 其他值 fallback 到 short + 警告日志
 */
export function resolvePromptLevel(): PromptLevel {
  const raw = (process.env.AGENT_PROMPT_LEVEL || "short").trim().toLowerCase();
  if (raw === "full" || raw === "short") return raw;
  console.warn(
    `[Prompts] Invalid AGENT_PROMPT_LEVEL value: "${process.env.AGENT_PROMPT_LEVEL}". ` +
    `Falling back to "short". Valid values are: "short" (default, 4 sections), "full" (legacy, 7 sections).`
  );
  return "short";
}

function loadPrompts(): SystemPrompts {
  const lang = (process.env.AGENT_PROMPTS_LANGUAGE || "en").trim().toLowerCase();

  if (cachedPrompts && cachedLang === lang) {
    return cachedPrompts;
  }

  cachedLang = lang;

  switch (lang) {
    case "zh":
      console.log(`[Prompts] Loaded Chinese system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
      cachedPrompts = ChinesePrompts;
      cachedHints = ChinesePromptHints;
      return cachedPrompts;

    case "en":
      console.log(`[Prompts] Loaded English system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
      cachedPrompts = EnglishPrompts;
      cachedHints = EnglishPromptHints;
      return cachedPrompts;

    default:
      console.warn(
        `[Prompts] Invalid AGENT_PROMPTS_LANGUAGE value: "${process.env.AGENT_PROMPTS_LANGUAGE}". ` +
        `Falling back to English. Valid values are: "zh" (Chinese), "en" (English).`
      );
      cachedPrompts = EnglishPrompts;
      cachedHints = EnglishPromptHints;
      return cachedPrompts;
  }
}

function loadHints() {
  loadPrompts(); // ensures cachedHints is populated
  return cachedHints!;
}

// 使用 Proxy 实现懒加载
export const Prompts = new Proxy({} as SystemPrompts, {
  get(target, prop: keyof SystemPrompts) {
    const prompts = loadPrompts();
    return prompts[prop];
  },
});

/**
 * 拼接 `runTask` 注入的静态 `system` 内容。
 *
 * open spec: optimize-agent-prompt-and-skill-mounting
 *
 * 行为：
 * - `short` (default): 只拼 4 段核心策略（agentRole + skillDiscovery + skillGenerator +
 *   extendedSkillRouting）。3 段（taskTracking / confirmationUI / downloadUrl）已降级为
 *   一行 hint，由 manage_tasks / execute_skill_with_context 工具 description 引用，
 *   或后端输出守卫强制（downloadUrl）。
 * - `full`: 旧行为，拼完整 7 段。用于内网环境紧急回退 / 调试。
 *
 * 启动时打印一次 `[Prompts] Built <level> prompt (chars=N)` 便于监控 prompt 体积。
 */
export function buildStaticSystemPrompt(level: PromptLevel = resolvePromptLevel()): string {
  const prompts = loadPrompts();
  const result = level === "full"
    ? (
        prompts.agentRolePrompt
        + prompts.skillDiscoveryPolicy
        + prompts.skillGeneratorPolicy
        + prompts.extendedSkillRoutingPolicy
        + prompts.taskTrackingPolicy
        + prompts.confirmationUIPolicy
        + prompts.downloadUrlPolicy
      )
    : (
        prompts.agentRolePrompt
        + prompts.skillDiscoveryPolicy
        + prompts.skillGeneratorPolicy
        + prompts.extendedSkillRoutingPolicy
      );

  if (!loggedBuiltPromptOnce) {
    console.log(`[Prompts] Built ${level} prompt (chars=${result.length})`);
    loggedBuiltPromptOnce = true;
  }
  return result;
}

/**
 * 暴露 prompt hints（中文/英文自动切换），供工具 description 引用一行版策略。
 * 不属于 buildStaticSystemPrompt 拼接范围，避免重复发送。
 */
export const PromptHints = new Proxy({} as { taskTrackingHint: string; confirmationHint: string; downloadUrlHint: string }, {
  get(_target, prop: keyof { taskTrackingHint: string; confirmationHint: string; downloadUrlHint: string }) {
    return loadHints()[prop];
  },
});

export type { SystemPrompts, TasksStatusMap, TaskState, TaskStatusValue } from "./types";
