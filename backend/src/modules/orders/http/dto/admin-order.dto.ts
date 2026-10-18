import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ManualRefundMethod, OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const PAISE = /^\d+$/;
const PAISE_MESSAGE = 'amountMinor must be a whole number of paise, as a string';

export class AdminOrderQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Order number or customer email, case-insensitive.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class RefundOrderDto {
  @ApiPropertyOptional({
    description: 'Reason, stored on the refund record and sent to Razorpay as a note.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Paise, as a string. Omitted refunds everything not refunded yet.',
    example: '9900',
  })
  @IsOptional()
  @Matches(PAISE, { message: PAISE_MESSAGE })
  amountMinor?: string;

  @ApiPropertyOptional({
    description: 'Take away what the order gave. Omitted: only when this refund completes the full amount.',
  })
  @IsOptional()
  @IsBoolean()
  revokeAccess?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Email the buyer about the refund.' })
  @IsOptional()
  @IsBoolean()
  notifyBuyer?: boolean;

  @ApiPropertyOptional({
    enum: ['NORMAL', 'INSTANT'],
    default: 'NORMAL',
    description:
      'NORMAL returns the money over the original rails and takes about 5-7 working days. ' +
      'INSTANT asks the provider for a real-time transfer that lands in minutes, which carries ' +
      'a per-refund fee and silently falls back to NORMAL where the payment method cannot support it. ' +
      'Omitted means NORMAL.',
  })
  @IsOptional()
  @IsIn(['NORMAL', 'INSTANT'])
  speed?: 'NORMAL' | 'INSTANT';
}

/** A refund the admin already made outside Razorpay, being recorded. */
export class ManualRefundDto {
  @ApiProperty({ description: 'Paise, as a string. At most what is left to refund.', example: '19900' })
  @Matches(PAISE, { message: PAISE_MESSAGE })
  amountMinor!: string;

  @ApiProperty({ enum: ManualRefundMethod })
  @IsEnum(ManualRefundMethod)
  method!: ManualRefundMethod;

  @ApiPropertyOptional({ description: 'UPI UTR, bank reference, and so on. Shown to the buyer if they are emailed.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiProperty({ description: 'When the money went back, with a timezone.', example: '2026-10-18T14:30:00+05:30' })
  @IsISO8601({ strict: true })
  refundedAt!: string;

  @ApiPropertyOptional({ description: 'Why. Stored on the refund record; not emailed.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ description: 'Take away what the order gave.' })
  @IsBoolean()
  revokeAccess!: boolean;

  @ApiPropertyOptional({ default: true, description: 'Email the buyer about the refund.' })
  @IsOptional()
  @IsBoolean()
  notifyBuyer?: boolean;
}

export class RevokeAccessDto {
  @ApiPropertyOptional({ description: 'Why. Stored on the revoked access.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
