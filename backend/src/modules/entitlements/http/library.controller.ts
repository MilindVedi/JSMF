import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { AssetKind } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { DownloadService } from '../application/download.service';
import { EntitlementService } from '../application/entitlement.service';

@ApiTags('library')
@Controller()
export class LibraryController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly downloads: DownloadService,
  ) {}

  @Get('me/purchases')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Everything this user currently has access to' })
  purchases(@CurrentUser() user: AuthenticatedUser) {
    return this.entitlements.listForUser(user.id);
  }

  /**
   * `@Public` because a free product must be downloadable without an account —
   * but the guard still attaches `request.user` when a valid token happens to
   * be present, so a signed-in buyer's entitlement is found and the download is
   * attributed to them. Authorisation itself happens in DownloadService, which
   * rejects an unowned paid product regardless of how this route is reached.
   */
  @Get('products/:id/download')
  @Public()
  @ApiOperation({
    summary: 'Get a short-lived signed download URL',
    description:
      'Free and paid products take the same path: the entitlement check is the only ' +
      'difference, and a free product is never handed a permanent public URL.',
  })
  async download(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('kind') kind: AssetKind | undefined,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const grant = await this.downloads.authorize({
      productId,
      userId: request.user?.id ?? null,
      kind,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return {
      url: grant.url,
      expiresAt: grant.expiresAt.toISOString(),
      filename: grant.filename,
    };
  }
}
