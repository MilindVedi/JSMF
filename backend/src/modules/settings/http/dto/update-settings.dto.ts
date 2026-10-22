import { ApiPropertyOptional } from '@nestjs/swagger';
import { MentorCardStyle } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({
    description:
      'Shows a "check your spam folder" line wherever a verification email or Google ' +
      'sign-in is offered, across the main website and the PDF store. Off hides it everywhere.',
  })
  @IsOptional()
  @IsBoolean()
  showSpamFolderNote?: boolean;

  @ApiPropertyOptional({
    enum: MentorCardStyle,
    description:
      "How Dr. Angad's portrait looks in the hero of the main website and the store: the arched " +
      'poster with floating rank medals (POSTER), or the framed photo with a credential card (CARD).',
  })
  @IsOptional()
  @IsEnum(MentorCardStyle)
  mentorCardStyle?: MentorCardStyle;
}
