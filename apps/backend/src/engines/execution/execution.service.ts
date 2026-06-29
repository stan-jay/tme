import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { CapabilityContext } from '@tme/connector-sdk';
import type { SJBLEntity } from '@tme/shared';
import { PluginRegistryService } from '../../platform/plugin-registry/plugin-registry.service';
import { IntegrationService } from '../../platform/integrations/integration.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExecutionResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ entityId: string; message: string }>;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly plugins: PluginRegistryService,
    private readonly integrations: IntegrationService,
    private readonly prisma: PrismaService,
  ) {}

  async executeMigration(
    migrationId: string,
    organizationId: string,
    data: SJBLEntity[],
    destinationConnectionId: string,
    requestIdempotencyKey: string,
  ): Promise<ExecutionResult> {
    const runtime = await this.integrations.runtimeConfiguration(
      destinationConnectionId,
      organizationId,
    );
    const writer = this.plugins.writer(runtime.pluginId);
    const result: ExecutionResult = { success: 0, failed: 0, skipped: 0, errors: [] };
    const context: CapabilityContext = {
      organizationId,
      connectionId: destinationConnectionId,
      pipelineRunId: migrationId,
      configuration: runtime.configuration,
    };

    // P0 remains intentionally serial. P1 will partition dependency levels and
    // execute independent partitions with bounded concurrency through BullMQ.
    for (const entity of data) {
      const idempotencyKey = `${requestIdempotencyKey}:${entity.id}`;
      const requestHash = createHash('sha256').update(JSON.stringify(entity)).digest('hex');
      const existing = await this.prisma.executionRecord.findUnique({ where: { idempotencyKey } });
      if (existing && existing.migrationId !== migrationId) {
        throw new BadRequestException('An idempotency key cannot be shared across pipeline runs');
      }
      if (existing && existing.requestHash !== requestHash) {
        throw new BadRequestException('An idempotency key was reused with different business data');
      }
      if (existing?.status === 'SUCCEEDED') {
        result.skipped++;
        continue;
      }

      const record = await this.prisma.executionRecord.upsert({
        where: { idempotencyKey },
        update: { status: 'PENDING', attemptCount: { increment: 1 }, errorMessage: null },
        create: {
          migrationId,
          idempotencyKey,
          entityId: entity.id,
          entityType: entity.type,
          requestHash,
          attemptCount: 1,
        },
      });

      const write = await writer.write(
        { entities: [entity], partitionId: entity.type, idempotencyKey: requestIdempotencyKey },
        context,
      );
      const item = write.items[0];
      if (item?.status === 'succeeded' || item?.status === 'skipped') {
        await this.prisma.executionRecord.update({
          where: { id: record.id },
          data: {
            status: item.status === 'succeeded' ? 'SUCCEEDED' : 'SKIPPED',
            destinationId: item.destinationId,
          },
        });
        item.status === 'succeeded' ? result.success++ : result.skipped++;
      } else {
        const message = item?.errorMessage || 'Writer returned no result';
        this.logger.error(`Entity ${entity.id} failed: ${message}`);
        await this.prisma.executionRecord.update({
          where: { id: record.id },
          data: {
            status: 'FAILED',
            errorCode: item?.errorCode || 'PLUGIN_WRITE_FAILED',
            errorMessage: message.slice(0, 2000),
          },
        });
        result.failed++;
        result.errors.push({ entityId: entity.id, message });
      }
    }
    return result;
  }
}
