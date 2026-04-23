/**
 * 系统提示词主入口模块
 * 
 * 模块职责：
 * 1. 根据环境变量配置动态加载对应语言的提示词
 * 2. 提供统一的 Prompts 导出对象
 * 3. 处理无效配置的回退逻辑
 * 
 * 配置说明：
 * - 环境变量：AGENT_PROMPTS_LANGUAGE
 * - 可选值：'zh'（中文）、'en'（英文）
 * - 默认值：'en'（英文，保持向后兼容）
 * - 大小写不敏感：ZH/zh 都会被识别为中文
 * 
 * 使用方式：
 * ```typescript
 * import { Prompts } from './prompts';
 * 
 * const policy = Prompts.skillGeneratorPolicy;
 * const summary = Prompts.buildTasksSummary(tasks);
 * ```
 * 
 * @module PromptsIndex
 * @author Agent Core Team
 * @since 1.0.0
 */

import type { SystemPrompts } from "./types";
import { EnglishPrompts } from "./en";
import { ChinesePrompts } from "./zh";

/**
 * 读取环境变量并确定使用的语言
 * 
 * 逻辑：
 * 1. 读取 AGENT_PROMPTS_LANGUAGE 环境变量
 * 2. 转换为小写进行大小写不敏感的比较
 * 3. 如果是 'zh'，使用中文提示词
 * 4. 如果是 'en' 或未设置，使用英文提示词（默认）
 * 5. 如果是其他值，输出警告并回退到英文
 */
function loadPrompts(): SystemPrompts {
  const lang = (process.env.AGENT_PROMPTS_LANGUAGE || "en").trim().toLowerCase();

  switch (lang) {
    case "zh":
      console.log(`[Prompts] Loaded Chinese system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
      return ChinesePrompts;
    
    case "en":
      console.log(`[Prompts] Loaded English system prompts (AGENT_PROMPTS_LANGUAGE=${lang})`);
      return EnglishPrompts;
    
    default:
      // 无效值，回退到英文并输出警告
      console.warn(
        `[Prompts] Invalid AGENT_PROMPTS_LANGUAGE value: "${process.env.AGENT_PROMPTS_LANGUAGE}". ` +
        `Falling back to English. Valid values are: "zh" (Chinese), "en" (English).`
      );
      return EnglishPrompts;
  }
}

/**
 * 导出的系统提示词对象
 * 
 * 根据 AGENT_PROMPTS_LANGUAGE 环境变量动态选择语言版本
 * 
 * 注意：语言选择在启动时确定，运行期间保持不变
 */
export const Prompts: SystemPrompts = loadPrompts();

// 重新导出类型定义，方便外部使用
export type { SystemPrompts, TasksStatusMap, TaskState, TaskStatusValue } from "./types";
