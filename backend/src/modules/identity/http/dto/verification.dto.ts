import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

/**
 * Six digits, and exactly six. `Length` rather than a numeric type on purpose:
 * a code is an opaque string of digits, not a number — `012345` must survive
 * the round trip, and a numeric parse would eat the leading zero.
 */
class CodeField {
  @ApiProperty({ example: '482913', description: 'The six-digit code from the message' })
  @IsString()
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  code!: string;
}

export class StartSignupDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;

  // Optional: the web signup now asks for the name after the code, on the
  // profile step. Still accepted so older clients keep working.
  @ApiPropertyOptional({ example: 'Ananya Rao' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name?: string;

  // Same floor and same reasoning as RegisterDto: 8 characters, no composition
  // rules. Validated here as well as there because this is now the route a
  // buyer actually takes, and the password is hashed before any code is sent.
  @ApiProperty({ example: 'a-long-passphrase', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(256)
  password!: string;
}

export class CompleteSignupDto extends CodeField {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;
}

export class VerifyResetCodeDto extends CodeField {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;
}

/**
 * Changing the password of an account that is already signed in. No email or
 * code: the current password is what proves this is the owner and not merely
 * a stolen access token.
 */
export class ChangePasswordDto {
  @ApiProperty({ example: 'the-current-passphrase' })
  @IsString()
  @MinLength(1, { message: 'Enter your current password' })
  @MaxLength(256)
  currentPassword!: string;

  // Same floor and same reasoning as every other password field here.
  @ApiProperty({ example: 'a-new-long-passphrase', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(256)
  newPassword!: string;
}

export class ResetPasswordDto extends CodeField {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'a-new-long-passphrase', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(256)
  password!: string;
}
