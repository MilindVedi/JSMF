import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class InviteAdminDto {
  @ApiProperty({ description: 'Who to invite. The link is emailed to this address.' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: 'Their name, used to address the invitation.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'From the emailed link. Single-use.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  // Length over composition rules: a long passphrase beats a short one with a
  // symbol in it, and Argon2 handles the rest.
  @MinLength(12)
  @MaxLength(200)
  password!: string;
}

export class ExchangeOAuthCodeDto {
  @ApiProperty({ description: 'The single-use code returned to the front-end after Google sign-in.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  code!: string;
}
