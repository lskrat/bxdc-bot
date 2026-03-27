import { Body, Controller, Delete, HttpException, Param, Post, Put } from '@nestjs/common';
import axios from 'axios';

@Controller('features/skills')
export class SkillProxyController {
  private readonly gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
  private readonly apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';

  @Post()
  async createSkill(@Body() payload: unknown) {
    return this.forwardRequest(() =>
      axios.post(`${this.gatewayUrl}/api/skills`, payload, {
        headers: this.gatewayHeaders,
      }),
    );
  }

  @Put(':id')
  async updateSkill(@Param('id') id: string, @Body() payload: unknown) {
    return this.forwardRequest(() =>
      axios.put(`${this.gatewayUrl}/api/skills/${id}`, payload, {
        headers: this.gatewayHeaders,
      }),
    );
  }

  @Delete(':id')
  async deleteSkill(@Param('id') id: string) {
    await this.forwardRequest(() =>
      axios.delete(`${this.gatewayUrl}/api/skills/${id}`, {
        headers: this.gatewayHeaders,
      }),
    );
    return { ok: true };
  }

  private get gatewayHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Agent-Token': this.apiToken,
    };
  }

  private async forwardRequest<T>(request: () => Promise<{ data: T }>): Promise<T> {
    try {
      const response = await request();
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data ?? { error: 'Skill gateway request failed' },
          error.response?.status ?? 500,
        );
      }
      throw error;
    }
  }
}
