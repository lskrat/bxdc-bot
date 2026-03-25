import { Controller, Post, Body, Inject } from '@nestjs/common';
import { AvatarService } from './service';
import { randomUUID } from 'crypto';
import { LoggerService } from '../../utils/logger.service';

@Controller('features/avatar')
export class AvatarController {
  private avatarService: AvatarService;

  constructor(private readonly logger: LoggerService) {}

  private getService(): AvatarService {
    if (!this.avatarService) {
      this.avatarService = new AvatarService(
        process.env.OPENAI_API_KEY || '',
        process.env.OPENAI_MODEL_NAME || 'gpt-4',
        process.env.OPENAI_API_BASE
      );
    }
    return this.avatarService;
  }

  @Post('generate')
  async generateAvatar(@Body() body: { nickname: string }) {
    if (!body.nickname) {
      return { avatar: '👤' };
    }
    const emoji = await this.getService().generateAvatar(body.nickname);
    return { avatar: emoji };
  }

  @Post('greeting')
  async generateGreeting(@Body() body: { nickname: string; avatar: string }) {
    const start = Date.now();
    const content = !body.nickname
      ? '欢迎回来！'
      : await this.getService().generateGreeting(body.nickname, body.avatar || '👤');

    const duration = Date.now() - start;
    this.logger.logLlm('output', {
      feature: 'greeting',
      nickname: body.nickname,
      duration: `${duration}ms`,
      response: content
    });

    const messageId = randomUUID();
    return {
      agent: {
        messages: [
          {
            lc: 1,
            type: 'constructor',
            id: ['langchain_core', 'messages', 'AIMessage'],
            kwargs: {
              id: messageId,
              content,
              additional_kwargs: {},
              response_metadata: {},
              type: 'ai',
              tool_calls: [],
              invalid_tool_calls: [],
              usage_metadata: {},
            },
          },
        ],
      },
    };
  }
}
