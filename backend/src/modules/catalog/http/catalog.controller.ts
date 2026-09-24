import { Controller, Get, Param, Query } from '@nestjs/common';
import { AssetKind, StorageProvider as StorageProviderName } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { ProductService } from '../application/product.service';
import { TaxonomyService } from '../application/taxonomy.service';
import { PublicProductQueryDto } from './dto/product.dto';

/**
 * The public storefront. Everything here is `@Public` and returns only
 * PUBLISHED, non-archived products.
 *
 * No endpoint in this controller returns a private asset's storage address. A
 * buyer reaches the actual file through the download endpoint, which checks an
 * entitlement first — so "can I see this product page" and "may I have the
 * file" stay separate questions.
 */
@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly products: ProductService,
    private readonly taxonomy: TaxonomyService,
    private readonly storage: StorageService,
  ) {}

  @Get('taxonomies')
  @ApiOperation({
    summary: 'Filters available on the storefront',
    description:
      'Rendered from the taxonomy tables, so a category kind added by an admin appears here ' +
      'without a deploy. Only terms with at least one published product are returned, and each ' +
      'carries its count — a filter that would return nothing is not offered at all.',
  })
  taxonomies() {
    return this.taxonomy.listWithTermsInUse();
  }

  @Get('products')
  @ApiOperation({ summary: 'Browse published products' })
  async list(@Query() query: PublicProductQueryDto) {
    const result = await this.products.findPublic(query);

    return {
      ...result,
      items: await Promise.all(
        result.items.map(async ({ assets, ...product }) => ({
          ...product,
          coverUrl: await this.coverUrl(assets[0]),
        })),
      ),
    };
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'A product page, by its permanent slug' })
  async detail(@Param('slug') slug: string) {
    // `cover` carries a storage address and is replaced by a URL here rather
    // than forwarded — same treatment the listing gives it.
    const { cover, ...product } = await this.products.findPublicBySlug(slug);

    return { ...product, coverUrl: await this.coverUrl(cover ?? undefined) };
  }

  /**
   * Covers live in the public bucket, so on Cloudinary this is a permanent CDN
   * URL. The local driver has no public surface and signs it instead, which
   * means a development cover link expires — harmless, and the alternative
   * would be an unauthenticated local route that serves arbitrary objects.
   */
  private async coverUrl(
    cover?: {
      storageProvider: StorageProviderName;
      bucket: string;
      objectKey: string;
      kind: AssetKind;
    },
  ): Promise<string | null> {
    if (!cover) return null;

    return this.storage.getSignedDownloadUrl(objectRefOf(cover), { disposition: 'inline' });
  }
}
