import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ColumnMapping } from '@tme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { computeSourceSignature } from './mapping-profile.util';

@Injectable()
export class MappingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds a saved profile matching the column layout, if one exists. */
  async find(organizationId: string, columns: string[]) {
    return this.prisma.mappingProfile.findUnique({
      where: {
        organizationId_sourceSignature: {
          organizationId,
          sourceSignature: computeSourceSignature(columns),
        },
      },
    });
  }

  async recordUse(id: string): Promise<void> {
    await this.prisma.mappingProfile.update({
      where: { id },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  /**
   * Saves or refreshes the profile for a column layout once mappings are
   * confirmed, so recurring imports of the same shape reuse them automatically.
   */
  async save(input: {
    organizationId: string;
    createdById: string;
    columns: string[];
    entityType: string;
    mappings: ColumnMapping[];
    name: string;
  }) {
    const sourceSignature = computeSourceSignature(input.columns);
    const mappings = input.mappings as unknown as Prisma.InputJsonValue;
    return this.prisma.mappingProfile.upsert({
      where: {
        organizationId_sourceSignature: { organizationId: input.organizationId, sourceSignature },
      },
      create: {
        organizationId: input.organizationId,
        createdById: input.createdById,
        name: input.name,
        sourceSignature,
        entityType: input.entityType,
        mappings,
      },
      update: {
        name: input.name,
        entityType: input.entityType,
        mappings,
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}
