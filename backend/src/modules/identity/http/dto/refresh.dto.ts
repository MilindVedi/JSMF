import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued by login or a previous refresh.' })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken!: string;
}
