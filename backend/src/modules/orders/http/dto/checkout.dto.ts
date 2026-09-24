import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Note what is absent: there is no amount field, and no way to add one without
 * this being reviewed. The price is read from the product row during checkout,
 * so a tampered client has nothing to tamper with.
 */
export class CheckoutDto {
  @ApiProperty({ description: 'The product being bought.' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Contact number for the invoice. The email comes from the account.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_Te9xALmvkDeoIW' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  razorpayOrderId!: string;

  @ApiProperty({ example: 'pay_Te9xBMnwlEfpJX' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  razorpayPaymentId!: string;

  @ApiProperty({ description: 'HMAC-SHA256 of `orderId|paymentId`, from the checkout widget.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  razorpaySignature!: string;
}

export class SimulateCheckoutDto {
  @ApiPropertyOptional({
    enum: ['success', 'failure'],
    default: 'success',
    description: 'Which of the two the real widget can hand back — a signed callback, or none.',
  })
  @IsOptional()
  @IsIn(['success', 'failure'])
  outcome?: 'success' | 'failure';
}
