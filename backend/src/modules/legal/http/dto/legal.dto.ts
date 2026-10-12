import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JsmfApp, LegalAcceptanceContext, LegalChangeKind, LegalDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AppQueryDto {
  @ApiPropertyOptional({ enum: JsmfApp, description: 'Only the sections this app shows. Omitted = every section.' })
  @IsOptional()
  @IsEnum(JsmfApp)
  app?: JsmfApp;
}

export class AcceptLegalDto {
  @ApiProperty({ enum: LegalDocumentType, isArray: true, description: 'Types only — the server decides which version is current.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(LegalDocumentType, { each: true })
  documents!: LegalDocumentType[];

  @ApiProperty({ enum: JsmfApp })
  @IsEnum(JsmfApp)
  app!: JsmfApp;

  @ApiProperty({ enum: LegalAcceptanceContext })
  @IsEnum(LegalAcceptanceContext)
  context!: LegalAcceptanceContext;

  @ApiPropertyOptional({ description: 'The order a CHECKOUT acknowledgement is for.' })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}

export class LegalSectionDto {
  @ApiProperty({ description: 'Stable within the document, e.g. "payments".' })
  @Matches(/^[a-z0-9][a-z0-9-]{0,63}$/, { message: 'Section ids are lowercase letters, digits and dashes' })
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  heading!: string;

  @ApiProperty({ description: 'Plain text: blank lines for paragraphs, "- " bullets, [text](url) links.' })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @ApiProperty({ enum: JsmfApp, isArray: true, description: 'Empty = shown on every app.' })
  @IsArray()
  @IsEnum(JsmfApp, { each: true })
  apps!: JsmfApp[];
}

export class SaveDraftDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [LegalSectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LegalSectionDto)
  sections!: LegalSectionDto[];

  @ApiPropertyOptional({ description: 'The published version this draft starts from (rollback).', nullable: true })
  @IsOptional()
  @IsUUID()
  basedOnVersionId?: string | null;
}

export class PublishDto {
  @ApiProperty({ enum: LegalChangeKind, description: 'MAJOR asks users to accept again; MINOR is a notice.' })
  @IsEnum(LegalChangeKind)
  changeKind!: LegalChangeKind;

  @ApiProperty({ description: 'What changed, shown in the history and to users.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  changeSummary!: string;

  @ApiPropertyOptional({ description: 'Schedule for later. Omitted = effective on publish.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveAt?: Date;
}

export class AcceptanceQueryDto {
  @ApiPropertyOptional({ enum: LegalDocumentType })
  @IsOptional()
  @IsEnum(LegalDocumentType)
  type?: LegalDocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  versionId?: string;

  @ApiPropertyOptional({ description: 'Name, email or phone.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;
}
