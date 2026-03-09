import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './controller/agent.controller';
import { MemoryController } from './controller/memory.controller';
import { UserController } from './controller/user.controller';
import { AvatarController } from './features/avatar/avatar.controller';
import { MemoryService } from './mem/memory.service';
import { SkillManager } from './skills/skill.manager';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AgentController, MemoryController, UserController, AvatarController],
  providers: [MemoryService, SkillManager],
})
export class AppModule {}
