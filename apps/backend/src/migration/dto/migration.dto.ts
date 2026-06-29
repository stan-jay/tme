import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnalyzeUploadDto {
  @IsString()
  @MaxLength(64)
  uploadId!: string;

  @IsIn(['excel', 'csv'])
  sourceType!: 'excel' | 'csv';
}

export class ConfirmedMappingDto {
  @IsString()
  @MaxLength(255)
  sourceColumn!: string;

  @IsString()
  @MaxLength(255)
  targetField!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;
}

export class ConfirmMappingsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedMappingDto)
  mappings!: ConfirmedMappingDto[];
}

export class ExecuteMigrationDto {
  @IsString()
  @MaxLength(128)
  destinationConnectionId!: string;

  @IsUUID()
  idempotencyKey!: string;
}

export class DetectMappingsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  columns!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}

export class AcceptScanDraftDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  entities!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsObject({ each: true })
  evidence?: Array<Record<string, unknown>>;
}
