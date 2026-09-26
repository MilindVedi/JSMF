import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(120)
  name!: string;

  // 8, the NIST SP 800-63B floor. No composition rules (a symbol, a digit):
  // they mostly push people toward predictable substitutions rather than
  // adding real entropy, and Argon2 is what makes offline cracking expensive.
  @ApiProperty({ example: 'a-long-passphrase', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(256)
  password!: string;
}
