import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { AssetKind } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { DownloadService } from '../application/download.service';
import { EntitlementService } from '../application/entitlement.service';
import { LibraryBookmarkService } from '../application/library-bookmark.service';

@ApiTags('library')
@Controller()
export class LibraryController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly downloads: DownloadService,
    private readonly storage: StorageService,
    private readonly bookmarks: LibraryBookmarkService,
  ) {}

  @Get('me/purchases')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Everything this user currently has access to' })
  async purchases(@CurrentUser() user: AuthenticatedUser) {
    const [rows, bookmarked] = await Promise.all([
      this.entitlements.listForUser(user.id),
      this.bookmarks.idsFor(user.id),
    ]);

    // The cover is stored as an address, never a URL (storage-provider.port);
    // it becomes one here, exactly as the store's own cards get theirs.
    return Promise.all(
      rows.map(async ({ product: { assets, ...product }, ...row }) => ({
        ...row,
        bookmarked: bookmarked.has(row.productId),
        product: {
          ...product,
          coverUrl: assets[0]
            ? await this.storage.getSignedDownloadUrl(objectRefOf(assets[0]), { disposition: 'inline' })
            : null,
        },
      })),
    );
  }

  @Put('me/bookmarks/:productId')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmark something in your library' })
  async bookmark(@CurrentUser() user: AuthenticatedUser, @Param('productId', ParseUUIDPipe) productId: string) {
    await this.bookmarks.add(user.id, productId);
  }

  @Delete('me/bookmarks/:productId')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a bookmark' })
  async unbookmark(@CurrentUser() user: AuthenticatedUser, @Param('productId', ParseUUIDPipe) productId: string) {
    await this.bookmarks.remove(user.id, productId);
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
