import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;

  // No MinLength here, deliberately: rejecting a short password at login with
  // a different error than a wrong one would reveal the policy that produced
  // an existing account's password.
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  password!: string;
}
