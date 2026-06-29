import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard, type AuthenticatedRequest } from '../../auth/auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import {
  CreateIntegrationConnectionDto,
  UpdateIntegrationConnectionDto,
  UpdatePluginCatalogDto,
} from './dto/integration.dto';
import { IntegrationService } from './integration.service';

@Controller('platform/integrations')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class IntegrationController {
  constructor(private readonly integrations: IntegrationService) {}

  @Get('catalog')
  listCatalog() {
    return this.integrations.listCatalog();
  }

  @Patch('catalog/:pluginId')
  updateCatalog(
    @Param('pluginId') pluginId: string,
    @Body() body: UpdatePluginCatalogDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrations.updateCatalog(pluginId, body, request.user);
  }

  @Get('connections')
  listConnections(@Req() request: AuthenticatedRequest) {
    return this.integrations.listConnections(request.user.organizationId);
  }

  @Get('available')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  listAvailable(@Req() request: AuthenticatedRequest) {
    return this.integrations.listAvailableConnections(request.user.organizationId);
  }

  @Post('connections')
  createConnection(
    @Body() body: CreateIntegrationConnectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrations.create(body, request.user);
  }

  @Patch('connections/:id')
  updateConnection(
    @Param('id') id: string,
    @Body() body: UpdateIntegrationConnectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrations.update(id, body, request.user);
  }

  @Post('connections/:id/test')
  testConnection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.integrations.test(id, request.user);
  }

  @Delete('connections/:id')
  removeConnection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.integrations.remove(id, request.user);
  }
}
