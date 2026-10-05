import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../../../events/domain/session-display';

/** The questions asked once, right after email signup. */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name!: string;

  // Same rule as the session registration form: a plain 10-digit Indian
  // mobile number. Stored unverified, never as the sign-in `phone`.
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  mobileNumber!: string;

  @ApiProperty({ enum: EXAM_OPTIONS })
  @IsIn(EXAM_OPTIONS as unknown as string[], { message: 'Choose the exam you are preparing for' })
  preparingFor!: string;

  @ApiProperty({ enum: STAGE_OPTIONS })
  @IsIn(STAGE_OPTIONS as unknown as string[], { message: 'Select your current stage' })
  currentStage!: string;
}
