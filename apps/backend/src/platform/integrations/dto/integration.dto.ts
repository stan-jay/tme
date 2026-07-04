import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PluginCommercialStatus, PluginTechnicalStatus } from '@prisma/client';

export class UpdatePluginCatalogDto {
  @IsOptional()
  @IsEnum(PluginTechnicalStatus)
  technicalStatus?: PluginTechnicalStatus;

  @IsOptional()
  @IsEnum(PluginCommercialStatus)
  commercialStatus?: PluginCommercialStatus;

  @IsOptional()
  @IsBoolean()
  globalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  newConnectionsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  existingConnectionsAllowed?: boolean;
}

export class CreateIntegrationConnectionDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(128)
  pluginId!: string;

  @IsObject()
  publicConfiguration!: Record<string, unknown>;

  @IsObject()
  secrets!: Record<string, unknown>;
}

export class UpdateIntegrationConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  publicConfiguration?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class PullIntegrationRecordsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resourceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  changedSince?: string;
}
