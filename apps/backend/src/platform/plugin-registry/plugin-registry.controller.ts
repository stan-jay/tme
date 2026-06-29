import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { PluginRegistryService } from './plugin-registry.service';

@Controller('platform/plugins')
@UseGuards(AuthGuard)
export class PluginRegistryController {
  constructor(private readonly plugins: PluginRegistryService) {}

  @Get()
  list() {
    return this.plugins.list().map((plugin) => plugin.manifest);
  }
}
