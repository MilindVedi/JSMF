import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MentorshipExceptionKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsContactPhone } from '../../../../shared/sms/domain/contact-phone';
import { MENTORSHIP_EXAM_OPTIONS } from '../../domain/options';

const MINOR_UNITS = /^\d{1,12}$/;
/** A joining link must be https: it is mailed to a paying customer. */
const HTTPS_URL = /^https:\/\/\S+$/;

// --- public / attendee ---------------------------------------------------------

export class SlotRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO start of the range. Defaults to now.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'ISO end of the range. Defaults to the end of the booking window.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class HoldSlotDto {
  @ApiProperty({ description: 'ISO start of one of the offered slots, exactly as the slot list returned it.' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  attendeeName!: string;

  @ApiProperty({ example: '+919876543210', description: 'E.164 with country code, or a 10-digit Indian mobile number.' })
  @IsString()
  @IsContactPhone()
  whatsappNumber!: string;

  @ApiProperty({ enum: MENTORSHIP_EXAM_OPTIONS })
  @IsIn(MENTORSHIP_EXAM_OPTIONS as unknown as string[], { message: "Choose what you're preparing for" })
  exam!: string;

  @ApiPropertyOptional({ description: 'What they would like to discuss.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RescheduleDto {
  @ApiProperty({ description: 'ISO start of an open slot.' })
  @IsISO8601({ strict: true })
  startsAt!: string;
}

// --- admin -----------------------------------------------------------------------

export class CreateOfferingDto {
  @ApiProperty({ example: '45 minutes. Just you and Dr. Angad.' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Defaults to one derived from the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ description: 'The line under the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: '99900', description: 'Price in paise, at least 100 (₹1).' })
  @IsString()
  @Matches(MINOR_UNITS, { message: 'priceAmountMinor must be a whole number of paise' })
  priceAmountMinor!: string;

  @ApiPropertyOptional({ example: '149900', nullable: true, description: 'The struck-through "was" price.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(MINOR_UNITS, { message: 'compareAtAmountMinor must be a whole number of paise' })
  compareAtAmountMinor?: string | null;

  @ApiPropertyOptional({ default: 45 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(240)
  durationMinutes?: number;

  @ApiPropertyOptional({ default: 15, description: 'Kept free after each call.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @ApiPropertyOptional({ default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ default: 720, description: 'The earliest slot is at least this many minutes away.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20160)
  minNoticeMinutes?: number;

  @ApiPropertyOptional({ default: 21 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  bookingWindowDays?: number;

  @ApiPropertyOptional({ default: 1440, description: 'Attendees may move their call until this many minutes before.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20160)
  rescheduleCutoffMinutes?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxReschedules?: number;

  @ApiPropertyOptional({ default: 'Google Meet' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  platformLabel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  highlights?: string[];
}

export class UpdateOfferingDto extends PartialType(CreateOfferingDto) {}

export class RuleDto {
  @ApiProperty({ description: '1 = Monday … 7 = Sunday' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @ApiProperty({ description: 'Minutes after local midnight, e.g. 1140 = 19:00' })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @ApiProperty({ description: 'Minutes after local midnight; 1440 = midnight' })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class ReplaceRulesDto {
  @ApiProperty({ type: [RuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules!: RuleDto[];
}

export class AddExceptionDto {
  @ApiProperty({ example: '2026-10-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ enum: MentorshipExceptionKind })
  @IsEnum(MentorshipExceptionKind)
  kind!: MentorshipExceptionKind;

  @ApiPropertyOptional({ nullable: true, description: 'Omit both times to block the whole day.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  note?: string;
}

export class AdminBookingsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'attention', 'past', 'cancelled', 'all'], default: 'upcoming' })
  @IsOptional()
  @IsIn(['upcoming', 'attention', 'past', 'cancelled', 'all'])
  view?: 'upcoming' | 'attention' | 'past' | 'cancelled' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  offeringId?: string;
}

export class MeetLinkDto {
  @ApiProperty({ nullable: true, example: 'https://meet.google.com/abc-defg-hij', description: 'Null clears it.' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  @Matches(HTTPS_URL, { message: 'The joining link must start with https://' })
  meetUrl!: string | null;
}

export class AdminRescheduleDto {
  @ApiProperty({ description: 'Any future ISO time; the call keeps the offering\'s duration.' })
  @IsISO8601({ strict: true })
  startsAt!: string;
}

export class SetBookingStatusDto {
  @ApiProperty({ enum: ['COMPLETED', 'NO_SHOW', 'CANCELLED'] })
  @IsIn(['COMPLETED', 'NO_SHOW', 'CANCELLED'])
  status!: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'Shown to the attendee when cancelling with notify on.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional({ default: true, description: 'Email the attendee about a cancellation.' })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
