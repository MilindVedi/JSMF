import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional } from 'class-validator';
import { MAX_OFFLINE_SALE_ROWS } from '../../domain/offline-sale-rows';

const BUYERS_DESCRIPTION =
  'One object per buyer: name, email, whatsappNumber?, amountPaidMinor (paise), discountMinor?, ' +
  'method (RAZORPAY_PAYMENT_PAGE | UPI_DIRECT | BANK_TRANSFER | CASH | OTHER), reference?, note?, ' +
  'paidAt (with a timezone, e.g. 2026-10-10T14:30:00+05:30), and the product type\'s own answers ' +
  '(a session\'s exam and stage). Checked row by row by the server, which reports every mistake at once.';

export class OfflineSalePreviewDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: BUYERS_DESCRIPTION })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_OFFLINE_SALE_ROWS)
  buyers!: unknown[];
}

export class RecordOfflineSalesDto extends OfflineSalePreviewDto {
  @ApiPropertyOptional({ enum: ['FORM', 'FILE'], default: 'FORM', description: 'How the admin entered them.' })
  @IsOptional()
  @IsIn(['FORM', 'FILE'])
  entry?: 'FORM' | 'FILE';
}
