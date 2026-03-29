import { DynamicTool } from '@langchain/core/tools';
import { RegisteredSkill } from './types';
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
