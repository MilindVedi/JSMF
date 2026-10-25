import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { AssetKind, ContentAccessPurpose } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { ContentAccessService, type ContentAccessGrant } from '../application/content-access.service';
import { EntitlementService } from '../application/entitlement.service';
import { LibraryBookmarkService } from '../application/library-bookmark.service';
import { ReadingProgressService, type ReadingPosition } from '../application/reading-progress.service';
import { isDownloadAllowed } from '../domain/content-access';
import { OpenForReadingQueryDto, SaveReadingProgressDto } from './dto/reading.dto';

type MaybeSignedIn = Request & { user?: AuthenticatedUser };

const progressOut = (position: ReadingPosition | undefined | null) =>
  position
    ? {
        page: position.page,
        pageCount: position.pageCount,
        assetId: position.assetId,
        updatedAt: position.updatedAt.toISOString(),
      }
    : null;

/** What a reader needs to open a file. Shared by the full file and its sample. */
const readerGrantOut = (grant: ContentAccessGrant) => ({
  url: grant.url,
  expiresAt: grant.expiresAt.toISOString(),
  expiresInSeconds: grant.expiresInSeconds,
  asset: grant.asset,
  product: grant.product,
  downloadAllowed: grant.downloadAllowed,
});

@ApiTags('library')
@Controller()
export class LibraryController {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly access: ContentAccessService,
    private readonly storage: StorageService,
    private readonly bookmarks: LibraryBookmarkService,
    private readonly reading: ReadingProgressService,
  ) {}

  @Get('me/purchases')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Everything this user currently has access to' })
  async purchases(@CurrentUser() user: AuthenticatedUser) {
    const [rows, bookmarked, storeWideDownloads] = await Promise.all([
      this.entitlements.listForUser(user.id),
      this.bookmarks.idsFor(user.id),
      this.access.storeWideDownloads(),
    ]);

    const readable = rows.flatMap((row) => [row.productId, ...(row.contents ?? []).map((item) => item.id)]);
    const progress = await this.reading.forProducts(user.id, readable);

    // The cover is stored as an address, never a URL (storage-provider.port);
    // it becomes one here, exactly as the store's own cards get theirs.
    return Promise.all(
      rows.map(async ({ product: { assets, downloadPolicy, ...product }, contents, ...row }) => ({
        ...row,
        bookmarked: bookmarked.has(row.productId),
        progress: progressOut(progress.get(row.productId)),
        downloadAllowed: isDownloadAllowed(downloadPolicy, storeWideDownloads),
        contents:
          contents?.map(({ downloadPolicy: itemPolicy, ...item }) => ({
            ...item,
            progress: progressOut(progress.get(item.id)),
            downloadAllowed: isDownloadAllowed(itemPolicy, storeWideDownloads),
          })) ?? null,
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

  @Get('me/reading/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Where you are in a product (null if you have not opened it)' })
  async readingPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return { progress: progressOut(await this.reading.get(user.id, productId)) };
  }

  @Put('me/reading/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save where you are in a product, for every device' })
  async saveReadingPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: SaveReadingProgressDto,
  ) {
    return { progress: progressOut(await this.reading.save(user.id, productId, body)) };
  }

  /**
   * `@Public` because a free product must be downloadable without an account —
   * but the guard still attaches `request.user` when a valid token happens to
   * be present, so a signed-in buyer's entitlement is found and the download is
   * attributed to them. Authorisation itself happens in ContentAccessService,
   * which rejects an unowned paid product regardless of how this route is
   * reached. The same holds for `read` and `sample` below.
   */
  @Get('products/:id/download')
  @Public()
  @ApiOperation({
    summary: 'Get a short-lived signed download URL',
    description:
      'Free and paid products take the same path: the entitlement check is the only ' +
      'difference, and a free product is never handed a permanent public URL. ' +
      'The PDF itself is refused with 403 when downloads are turned off for the product; ' +
      'other kinds (attachments) are not affected.',
  })
  async download(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('kind', new ParseEnumPipe(AssetKind, { optional: true })) kind: AssetKind | undefined,
    @Req() request: MaybeSignedIn,
  ) {
    const grant = await this.access.grant({
      productId,
      userId: request.user?.id ?? null,
      purpose: ContentAccessPurpose.DOWNLOAD,
      kind,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return { url: grant.url, expiresAt: grant.expiresAt.toISOString(), filename: grant.filename };
  }

  @Get('products/:id/read')
  @Public()
  @ApiOperation({
    summary: 'Open a product in the reader: a short-lived link to read it in place',
    description:
      'The same access rule as a download, without the download switch. The link expires; ' +
      'the reader asks again with `renew=true` and carries on. A signed-in reader also gets ' +
      'their saved position.',
  })
  async read(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: OpenForReadingQueryDto,
    @Req() request: MaybeSignedIn,
  ) {
    const userId = request.user?.id ?? null;
    const grant = await this.access.grant({
      productId,
      userId,
      purpose: ContentAccessPurpose.READ,
      renew: query.renew,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    const position = userId && !query.renew ? await this.reading.get(userId, productId) : null;

    return { ...readerGrantOut(grant), progress: progressOut(position) };
  }

  @Get('products/:id/sample')
  @Public()
  @ApiOperation({
    summary: 'Read a product’s sample: open to anyone, for products in the store',
    description: 'The sample is its own short file, so reading it gives away only those pages.',
  })
  async sample(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: OpenForReadingQueryDto,
    @Req() request: MaybeSignedIn,
  ) {
    const grant = await this.access.grant({
      productId,
      userId: request.user?.id ?? null,
      purpose: ContentAccessPurpose.SAMPLE,
      renew: query.renew,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return { ...readerGrantOut(grant), progress: null };
  }
}
