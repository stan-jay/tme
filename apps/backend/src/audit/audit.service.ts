import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    user: AuthUser;
    action: string;
    entityType: string;
    entityId: string;
    outcome?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: unknown;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.user.organizationId,
        userId: input.user.id,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        outcome: input.outcome || 'success',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        details: this.toJson(input.details),
      },
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
