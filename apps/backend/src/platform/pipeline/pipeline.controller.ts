import {
  Body,
  Controller,
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
  CreatePipelineDefinitionDto,
  CreateMigrationTemplateDto,
  StartPipelineRunDto,
  UpdatePipelineStatusDto,
} from './dto/pipeline.dto';
import { PipelineService } from './pipeline.service';

@Controller('platform/pipelines')
@UseGuards(AuthGuard, RolesGuard)
export class PipelineController {
  constructor(private readonly pipelines: PipelineService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  listDefinitions(@Req() request: AuthenticatedRequest) {
    return this.pipelines.listDefinitions(request.user.organizationId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() body: CreatePipelineDefinitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pipelines.create(body, request.user);
  }

  @Post('templates/migration')
  @Roles(UserRole.ADMIN)
  createMigrationTemplate(
    @Body() body: CreateMigrationTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pipelines.createMigrationTemplate(
      body.name,
      body.sourceConnectionId,
      body.destinationConnectionId,
      request.user,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdatePipelineStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pipelines.updateStatus(id, body.status, request.user);
  }

  @Post(':id/runs')
  @Roles(UserRole.ADMIN, UserRole.EXECUTOR)
  start(
    @Param('id') id: string,
    @Body() body: StartPipelineRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pipelines.start(id, body, request.user);
  }

  @Get('runs/history')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  listRuns(@Req() request: AuthenticatedRequest) {
    return this.pipelines.listRuns(request.user.organizationId);
  }

  @Get('runs/:id')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  getRun(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.pipelines.getRun(id, request.user.organizationId);
  }

  @Post('runs/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.EXECUTOR)
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.pipelines.cancel(id, request.user);
  }
}
