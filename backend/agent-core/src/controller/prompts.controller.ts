import { Controller, Get } from '@nestjs/common';
import { Prompts } from '../prompts';

/**
 * 提示词管理控制器。
 * <p>
 * 提供外部系统获取默认提示词的端点。
 * </p>
 */
@Controller('prompts')
export class PromptsController {

    /**
     * 获取外部 API 接入默认系统提示词。
     * 语言随 AGENT_PROMPTS_LANGUAGE 环境变量自动切换。
     */
    @Get('external-api-default')
    getExternalApiDefaultPrompt(): { prompt: string } {
        return { prompt: Prompts.externalApiSystemPrompt };
    }
}
