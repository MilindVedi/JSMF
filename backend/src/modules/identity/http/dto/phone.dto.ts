import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import type { VerificationChannelName } from '../../domain/verification-channel.port';

/**
 * Loose on purpose: people type numbers with spaces, dashes, brackets and
 * prefixes. The real validation is `normalisePhoneNumber`, which the service
 * runs — duplicating its rules here would mean two definitions of "valid".
 */
class PhoneField {
  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @MinLength(8, { message: 'Enter your mobile number' })
  @MaxLength(24)
  phone!: string;
}

/** Only phone channels are accepted here; email is not a way to reach a phone. */
const PHONE_CHANNELS: VerificationChannelName[] = ['whatsapp', 'sms'];

export class StartPhoneDto extends PhoneField {
  @ApiPropertyOptional({
    enum: PHONE_CHANNELS,
    description: 'Omit for the preferred channel. Pass `sms` to resend by SMS after WhatsApp.',
  })
  @IsOptional()
  @IsIn(PHONE_CHANNELS)
  channel?: VerificationChannelName;
}

export class VerifyPhoneDto extends PhoneField {
  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  code!: string;
}

export class RegisterPhoneDto extends PhoneField {
  @ApiProperty({ description: 'From a `registration-required` verify response' })
  @IsString()
  @MaxLength(128)
  registrationToken!: string;

  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name!: string;
}
