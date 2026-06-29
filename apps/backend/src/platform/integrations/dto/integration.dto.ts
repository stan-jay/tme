import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
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
