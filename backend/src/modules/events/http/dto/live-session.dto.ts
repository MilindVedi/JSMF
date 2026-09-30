import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../../domain/session-display';

const MINOR_UNITS = /^\d{1,12}$/;
const HTTP_URL = /^https?:\/\/\S+$/;

export class CreateLiveSessionDto {
  @ApiProperty({ example: 'From MBBS to AIR 925: How to Prepare Smarter, Not Longer' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Defaults to one derived from the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiProperty({ description: 'The one-line summary under the title.' })
  @IsString()
  @MaxLength(300)
  tagline!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: '2026-10-12T19:30:00+05:30' })
  @IsDateString({}, { message: 'startsAt must be an ISO date-time' })
  startsAt!: string;

  @ApiProperty({ example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(12 * 60)
  durationMinutes!: number;

  @ApiProperty({ example: 'Live on Zoom · Link sent on mail' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  platformLabel!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Seats. Null or omitted = unlimited.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity?: number | null;

  @ApiProperty({ example: '9900', description: 'Paise, as a string. Always paid, so > 0.' })
  @Matches(MINOR_UNITS, { message: 'priceAmountMinor must be a whole number of paise' })
  priceAmountMinor!: string;

  @ApiPropertyOptional({ nullable: true, example: '49900' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MINOR_UNITS, { message: 'compareAtAmountMinor must be a whole number of paise' })
  compareAtAmountMinor?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Private. Emailed to seat holders only.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(HTTP_URL, { message: 'The joining link must be an http(s) URL' })
  @MaxLength(2000)
  joinUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(HTTP_URL, { message: 'The recording link must be an http(s) URL' })
  @MaxLength(2000)
  recordingUrl?: string | null;

  @ApiPropertyOptional({ type: [String], description: '"What you\'ll learn", in order.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  highlights?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  perkText?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'PDF products granted free with a seat (the revision planner). Replaces the set.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  includedProductIds?: string[];
}

export class UpdateLiveSessionDto extends PartialType(CreateLiveSessionDto) {}

export class RegisterForSessionDto {
  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(/^[0-9+\-\s]{10,18}$/, { message: 'Enter a valid WhatsApp number' })
  whatsappNumber!: string;

  @ApiProperty({ enum: EXAM_OPTIONS })
  @IsIn(EXAM_OPTIONS as unknown as string[], { message: "Choose the exam you're preparing for" })
  exam!: string;

  @ApiProperty({ enum: STAGE_OPTIONS })
  @IsIn(STAGE_OPTIONS as unknown as string[], { message: 'Select where you are right now' })
  stage!: string;
}
