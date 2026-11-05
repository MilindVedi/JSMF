import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PLAN_MONTHS } from '../../../../shared/pyq-plan';

/**
 * Paise as a string of digits: ₹1 (100) up to ₹1,00,000 (10000000). Money
 * never travels as a JSON number, and the upper bound is there so a slipped
 * extra zero is refused rather than charged.
 */
const PAISE = /^(?:[1-9]\d{2,6}|10000000)$/;
const PAISE_MESSAGE = 'must be a whole number of paise, as a string, from 100 (₹1) to 10000000 (₹1,00,000)';

export class UpdateSubscriptionSettingsDto {
  @ApiPropertyOptional({ description: 'Whether students who have never had a trial or a plan may start one.' })
  @IsOptional()
  @IsBoolean()
  trialEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 90, description: 'Length of trials started from now on. Running trials keep theirs.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  trialDays?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 12,
    description: 'The benefits every plan shows, in order. Blank lines and repeats are dropped.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  features?: string[];
}

export class CreatePlanDto {
  @ApiPropertyOptional({ maxLength: 80, description: 'Shown on the card. Empty = "3 months" and so on.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true, description: 'One line under the title.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  subtitle?: string | null;

  @ApiProperty({ minimum: 1, maximum: MAX_PLAN_MONTHS, description: 'Calendar months of access per purchase.' })
  @IsInt()
  @Min(1)
  @Max(MAX_PLAN_MONTHS)
  durationMonths!: number;

  @ApiProperty({ example: '99900', description: `The price, in paise. ${PAISE_MESSAGE}.` })
  @Matches(PAISE, { message: `priceAmountMinor ${PAISE_MESSAGE}` })
  priceAmountMinor!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Struck-through "was" price, in paise. Display only.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(PAISE, { message: `compareAtAmountMinor ${PAISE_MESSAGE}` })
  compareAtAmountMinor?: string | null;

  @ApiPropertyOptional({ description: 'Wears the "Best value" badge.' })
  @IsOptional()
  @IsBoolean()
  popular?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Put on sale at once. False saves it off sale.' })
  @IsOptional()
  @IsBoolean()
  onSale?: boolean;
}

/**
 * Any subset. A new price or length replaces the plan with a new version
 * (with a new id); everything else changes in place.
 */
export class UpdatePlanDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  subtitle?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PLAN_MONTHS })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PLAN_MONTHS)
  durationMonths?: number;

  @ApiPropertyOptional({ example: '99900' })
  @IsOptional()
  @Matches(PAISE, { message: `priceAmountMinor ${PAISE_MESSAGE}` })
  priceAmountMinor?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(PAISE, { message: `compareAtAmountMinor ${PAISE_MESSAGE}` })
  compareAtAmountMinor?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  popular?: boolean;
}

export class SetPlanOnSaleDto {
  @ApiProperty({ description: 'True puts it on sale; false takes it off. Nobody on the plan loses access.' })
  @IsBoolean()
  onSale!: boolean;
}
