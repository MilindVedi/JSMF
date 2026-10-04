import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BundleDeliveryMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
  ValidateNested,
} from 'class-validator';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../../domain/session-display';

const MINOR_UNITS = /^\d{1,12}$/;
const HTTP_URL = /^https?:\/\/\S+$/;

export const MAX_SESSION_DAYS = 14;

export class SessionDayDto {
  @ApiPropertyOptional({ description: 'An existing day being edited. Omit for a new day.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: '2026-10-12T19:30:00+05:30' })
  @IsDateString({}, { message: 'Each day needs a valid start date and time' })
  startsAt!: string;

  @ApiProperty({ example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(12 * 60)
  durationMinutes!: number;
}

export class CreateLiveSessionDto {
  @ApiProperty({ example: 'From MBBS to Your Dream Rank: How to Prepare Smarter, Not Longer' })
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

  @ApiProperty({
    type: [SessionDayDto],
    description:
      'One entry per day. The whole list is sent on every save; days left out are removed. ' +
      'Empty means the dates have not been fixed yet — the website shows "To be announced" ' +
      'and registration stays open.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SESSION_DAYS)
  @ValidateNested({ each: true })
  @Type(() => SessionDayDto)
  days!: SessionDayDto[];

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

  @ApiPropertyOptional({
    description: 'When false, seat counts (seatsRemaining and displaySeats) are hidden from the public API.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showSeats?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'TEMPORARY external-checkout scarcity number for /prep-kit. Null = no seats line, 0 = fully booked.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  displaySeats?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      '"Who is this session for?" — one paragraph. Null or blank hides the section on the website.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(600)
  audienceText?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Testimonials section heading. Null falls back to a generic default.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(150)
  testimonialsHeading?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Testimonials section subheading. Null falls back to a generic default.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  testimonialsSubheading?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Small label shown to the right of the testimonials heading, e.g. "Previous FMGE session". ' +
      'Null falls back to a generic default.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  testimonialsTag?: string | null;

  @ApiPropertyOptional({
    enum: BundleDeliveryMode,
    default: BundleDeliveryMode.IMMEDIATE,
    description:
      'When the items included with a seat reach buyers. IMMEDIATE = at payment, named in the ' +
      'confirmation email. AUTO_AFTER_SESSION = automatically once the session has ended and the ' +
      'item is published. MANUAL = only when an admin sends it. Use a deferred mode while the PDF ' +
      'is still being prepared.',
  })
  @IsOptional()
  @IsEnum(BundleDeliveryMode)
  bundleDeliveryMode?: BundleDeliveryMode;

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

export class SendBundleDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Who to send to. Omit for everyone who has not received it yet, which also retries ' +
      'earlier failures. Anyone already sent to is skipped either way.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  userIds?: string[];
}

export class SendDateAnnouncementDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Who to send to. Omit for everyone who has not been told the current dates yet, ' +
      'which also retries earlier failures and covers buyers told about old dates.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  userIds?: string[];
}

export class ReorderTestimonialsDto {
  @ApiProperty({
    type: [String],
    description: 'Every testimonial id for this session, once each, in the new display order.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  testimonialIds!: string[];
}

export class RegisterForSessionDto {
  @ApiPropertyOptional({
    example: '9876543210',
    description:
      'A 10-digit Indian mobile number, no country code. A contact number on file — nothing ' +
      'sends WhatsApp or SMS to it today.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  whatsappNumber?: string;

  @ApiProperty({ enum: EXAM_OPTIONS })
  @IsIn(EXAM_OPTIONS as unknown as string[], { message: "Choose the exam you're preparing for" })
  exam!: string;

  @ApiProperty({ enum: STAGE_OPTIONS })
  @IsIn(STAGE_OPTIONS as unknown as string[], { message: 'Select where you are right now' })
  stage!: string;
}
