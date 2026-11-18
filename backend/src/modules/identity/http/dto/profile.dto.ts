import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsContactPhone } from '../../../../shared/sms/domain/contact-phone';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../../../events/domain/session-display';

export class UpdateNameDto {
  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name!: string;
}

/**
 * Just the contact number, for apps that edit it without the signup
 * questions. `null` removes it; leaving the field out is refused, so a client
 * bug can never clear a number by omission.
 */
export class UpdateMobileDto {
  @ApiProperty({
    example: '+919876543210',
    nullable: true,
    description: 'E.164 with country code, or a 10-digit Indian mobile number; null removes it.',
  })
  @ValidateIf((dto: UpdateMobileDto) => dto.mobileNumber !== null)
  @IsString()
  @IsContactPhone()
  mobileNumber!: string | null;
}

/** The questions asked once, right after email signup. */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name!: string;

  // Same rule as the session registration form: E.164 for any country, or a
  // bare 10-digit Indian mobile (older pages). Stored unverified, never as the
  // sign-in `phone`.
  @ApiProperty({
    example: '+919876543210',
    description: 'E.164 with country code, or a 10-digit Indian mobile number.',
  })
  @IsString()
  @IsContactPhone()
  mobileNumber!: string;

  @ApiProperty({ enum: EXAM_OPTIONS })
  @IsIn(EXAM_OPTIONS as unknown as string[], { message: 'Choose the exam you are preparing for' })
  preparingFor!: string;

  @ApiProperty({ enum: STAGE_OPTIONS })
  @IsIn(STAGE_OPTIONS as unknown as string[], { message: 'Select your current stage' })
  currentStage!: string;
}
