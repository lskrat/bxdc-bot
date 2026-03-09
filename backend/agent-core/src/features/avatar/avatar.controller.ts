import { Controller, Post, Body } from '@nestjs/common';
import { AvatarService } from './service';
import { randomUUID } from 'crypto';

@Controller('features/avatar')
export class AvatarController {
  private avatarService: AvatarService;

  constructor() {
    this.avatarService = new AvatarService(
      process.env.OPENAI_API_KEY || '',
      process.env.OPENAI_MODEL_NAME || 'gpt-4',
      process.env.OPENAI_API_BASE
    );
  }

  @Post('generate')
  async generateAvatar(@Body() body: { nickname: string }) {
    if (!body.nickname) {
      return { avatar: '👤' };
    }
    const emoji = await this.avatarService.generateAvatar(body.nickname);
    return { avatar: emoji };
  }

  @Post('greeting')
  async generateGreeting(@Body() body: { nickname: string; avatar: string }) {
    const content = !body.nickname
      ? 'Welcome!'
      : await this.avatarService.generateGreeting(body.nickname, body.avatar || '👤');

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
