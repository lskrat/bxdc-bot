import { Controller, Post, Body } from '@nestjs/common';
import { AvatarService } from './service';
import { pickMergedLlm } from '../../utils/llm-merge';

@Controller('features/avatar')
export class AvatarController {
  private serviceForRequest(overrides: { llmApiBase?: string; llmModelName?: string; llmApiKey?: string }) {
    const llm = pickMergedLlm(overrides);
    return new AvatarService(llm.apiKey || '', llm.modelName, llm.baseUrl);
  }

  @Post('generate')
  async generateAvatar(
    @Body()
    body: {
      nickname: string;
      llmApiBase?: string;
      llmModelName?: string;
      llmApiKey?: string;
    },
  ) {
    if (!body.nickname) {
      return { avatar: '👤' };
    }
    const llm = pickMergedLlm(body);
    if (!llm.apiKey) {
      return { avatar: '👤', error: 'NO_API_KEY' };
    }
    const svc = this.serviceForRequest(body);
    const emoji = await svc.generateAvatar(body.nickname);
    return { avatar: emoji };
  }
}
