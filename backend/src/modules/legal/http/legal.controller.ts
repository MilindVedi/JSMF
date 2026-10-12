import { Body, Controller, Get, Header, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { LegalAcceptanceService } from '../application/legal-acceptance.service';
import { LegalDocumentsService } from '../application/legal-documents.service';
import { AcceptLegalDto, AppQueryDto } from './dto/legal.dto';
import { parseDocumentType } from './document-type';

/**
 * What every app reads: the current text, any published version by number,
 * and — signed in — the user's own acceptance status and the accept action.
 */
@ApiTags('legal')
@SkipLegalCheck()
@Controller('legal')
export class LegalController {
  constructor(
    private readonly documents: LegalDocumentsService,
    private readonly acceptance: LegalAcceptanceService,
  ) {}

  @Public()
  @Get('documents/:type')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'The version in force now (terms | privacy | refund), with only the sections the app shows' })
  current(@Param('type') type: string, @Query() query: AppQueryDto) {
    return this.documents.current(parseDocumentType(type), query.app);
  }

  @Public()
  @Get('documents/:type/versions')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Every published version of a document, newest first, without the text' })
  versions(@Param('type') type: string) {
    return this.documents.publishedList(parseDocumentType(type));
  }

  @Public()
  @Get('documents/:type/versions/:version')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'One published version by number — never changes once published' })
  version(@Param('type') type: string, @Param('version') version: string, @Query() query: AppQueryDto) {
    return this.documents.published(parseDocumentType(type), version, query.app);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: "This user's acceptance of each current document, and whether they must act" })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.acceptance.status(user.id);
  }

  @ApiBearerAuth()
  @Post('accept')
  @ApiOperation({
    summary: 'Record acceptance of the current version of each named document',
    description: 'Send only after an explicit user action (an unticked checkbox, then submit). The version is decided by the server.',
  })
  accept(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptLegalDto, @Req() request: Request) {
    return this.acceptance.accept(user.id, dto, {
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }
}
