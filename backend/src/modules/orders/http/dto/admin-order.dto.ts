import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
    description: 'Reason shown to the buyer and stored on the refund record.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

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
