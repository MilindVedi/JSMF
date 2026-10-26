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

  @ApiPropertyOptional({
    description:
      'Whether store buyers may download files, or only read them in the browser reader. ' +
      'A product can override this either way. On until the mobile apps ship.',
  })
  @IsOptional()
  @IsBoolean()
  downloadsEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'The "Med Prep" link in the header of the main website and the PDF store, pointing at ' +
      'the PYQ practice site. Off removes it from both at once.',
  })
  @IsOptional()
  @IsBoolean()
  medPrepLinkEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether that link wears its "New" badge and pulse. Its own switch, because a new thing ' +
      'stops being new long before it stops being worth linking to. Ignored while the link is off.',
  })
  @IsOptional()
  @IsBoolean()
  medPrepLinkHighlight?: boolean;
}
