import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({
    description:
      'Shows a "check your spam folder" line wherever a verification email or Google ' +
      'sign-in is offered, across the main website and the PDF store. Off hides it everywhere.',
  })
  @IsOptional()
  @IsBoolean()
  showSpamFolderNote?: boolean;
}
