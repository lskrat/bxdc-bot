import { DynamicTool } from '@langchain/core/tools';
import { RegisteredSkill } from './types';
export declare const MAX_COMPAT_TOOL_HINT_LENGTH = 220;
export declare class SkillManager {
    private getConfiguredRoots;
    private collectSkillDirs;
    private parseSkillDir;
    listSkills(): RegisteredSkill[];
    buildSkillPromptContext(): string;
    private buildToolResult;
    getLangChainTools(): DynamicTool[];
    describeTool(toolName: string): {
        displayName: string;
        kind: 'skill' | 'tool';
    };
}
