import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { LegalAcceptanceService } from '../application/legal-acceptance.service';
import { LegalDocumentsService, type Actor } from '../application/legal-documents.service';
import { AcceptanceQueryDto, PublishDto, SaveDraftDto } from './dto/legal.dto';
import { parseDocumentType } from './document-type';

const actorFrom = (user: AuthenticatedUser, request: Request): Actor => ({ id: user.id, ip: request.ip ?? null });

/**
 * Drafting and publishing legal documents, and the acceptance trail. ADMIN
 * only — not EDUCATOR: publishing changes what every user agrees to.
 *
 * There is deliberately no route that edits or deletes a published version;
 * the only delete is of a draft. Rolling back is a new draft based on an old
 * version, published as the next number.
 */
@ApiTags('admin: legal')
@ApiBearerAuth()
@Roles('ADMIN')
// An admin must be able to fix the documents even before accepting them.
@SkipLegalCheck()
@Controller('admin/legal')
export class AdminLegalController {
  constructor(
    private readonly documents: LegalDocumentsService,
    private readonly acceptance: LegalAcceptanceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Per document: the live version, any scheduled one, the draft, and acceptance coverage' })
  async overview() {
    const [documents, coverage] = await Promise.all([this.documents.overview(), this.acceptance.coverage()]);
    return { enforced: this.acceptance.enforced, documents, coverage };
  }

  @Get('acceptances')
  @ApiOperation({ summary: 'The acceptance trail, newest first' })
  acceptances(@Query() query: AcceptanceQueryDto) {
    return this.acceptance.list(query);
  }

  @Get('versions/:id')
  @ApiOperation({ summary: 'One version, draft or published, with its full text' })
  version(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.version(id);
  }

  @Get(':type/versions')
  @ApiOperation({ summary: 'Every version of a document, the draft first' })
  history(@Param('type') type: string) {
    return this.documents.history(parseDocumentType(type));
  }

  @Put(':type/draft')
  @ApiOperation({ summary: "Create the document's draft, or replace its text" })
  saveDraft(
    @Param('type') type: string,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documents.saveDraft(parseDocumentType(type), dto, actorFrom(user, request));
  }

  @Delete(':type/draft')
  @HttpCode(204)
  @ApiOperation({ summary: 'Discard the draft (published versions cannot be deleted)' })
  async discardDraft(@Param('type') type: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.documents.discardDraft(parseDocumentType(type), actorFrom(user, request));
  }

  @Post(':type/draft/publish')
  @ApiOperation({ summary: 'Publish the draft as the next version number' })
  publish(
    @Param('type') type: string,
    @Body() dto: PublishDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documents.publish(parseDocumentType(type), dto, actorFrom(user, request));
  }
}
