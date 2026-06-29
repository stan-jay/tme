import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PipelineDefinitionStatus } from '@prisma/client';

export class PipelineStageDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,63}$/)
  key!: string;

  @IsString()
  @MaxLength(40)
  kind!: string;

  @IsString()
  @MaxLength(80)
  capability!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  dependsOn!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  connectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  knowledgePackId?: string;

  @IsObject()
  configuration!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts!: number;

  @IsInt()
  @Min(0)
  @Max(3_600_000)
  backoffMs!: number;

  @IsInt()
  @Min(0)
  @Max(86_400_000)
  maxBackoffMs!: number;
}

export class CreatePipelineDefinitionDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @MaxLength(40)
  operation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceConnectionId?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  destinationConnectionIds!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  knowledgePackIds!: string[];

  @IsInt()
  @Min(1)
  @Max(50)
  maxParallelStages!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  maxParallelPartitions!: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageDto)
  stages!: PipelineStageDto[];
}

export class UpdatePipelineStatusDto {
  @IsEnum(PipelineDefinitionStatus)
  status!: PipelineDefinitionStatus;
}

export class StartPipelineRunDto {
  @IsUUID()
  idempotencyKey!: string;

  @IsObject()
  input!: Record<string, unknown>;
}

export class CreateMigrationTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceConnectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  destinationConnectionId?: string;
}
