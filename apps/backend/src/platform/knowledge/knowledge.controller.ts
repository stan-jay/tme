import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../auth/auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { KnowledgePackRegistry } from './knowledge-pack.registry';

@Controller('platform/knowledge')
@UseGuards(AuthGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly registry: KnowledgePackRegistry) {}

  @Get('packs')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  async listPacks() {
    const packs = this.registry.list();
    return Promise.all(
      packs.map(async (pack) => ({
        manifest: pack.manifest,
        rules: await pack.rules(),
      })),
    );
  }
}
