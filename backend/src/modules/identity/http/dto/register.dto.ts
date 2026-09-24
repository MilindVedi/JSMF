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

  // 12 rather than the more common 8: length is the only property that
  // reliably resists offline cracking, and composition rules (a symbol, a
  // digit) mostly push people toward predictable substitutions instead.
  @ApiProperty({ example: 'a-long-passphrase', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(256)
  password!: string;
}
