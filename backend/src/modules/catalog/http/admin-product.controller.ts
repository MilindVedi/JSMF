import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { ProductAssetService } from '../application/product-asset.service';
import { ProductService } from '../application/product.service';
import { TaxonomyService } from '../application/taxonomy.service';
import { actorFrom } from './actor';
import {
  AdminProductQueryDto,
  CreateProductDto,
  ProductLinkDto,
  UpdateProductDto,
  UploadAssetDto,
} from './dto/product.dto';
import { SetProductTermsDto } from './dto/taxonomy.dto';

/**
 * Read from process.env rather than AppConfig because decorator arguments are
 * evaluated when the class is defined, before the DI container exists. Env
 * validation still governs the value; this is only how it is reached here.
 */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 64) * 1024 * 1024;

@ApiTags('admin: catalog')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/products')
export class AdminProductController {
  constructor(
    private readonly products: ProductService,
    private readonly assets: ProductAssetService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List products, including drafts' })
  list(@Query() query: AdminProductQueryDto) {
    return this.products.findForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full product detail, including every asset version' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findAdminDetail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product (always starts as DRAFT)' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.create(dto, actorFrom(user, request));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.update(id, dto, actorFrom(user, request));
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Go live. Refused unless a current primary file exists.' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.publish(id, actorFrom(user, request));
  }

  @Post(':id/unpublish')
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.unpublish(id, actorFrom(user, request));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Archive (soft delete)',
    description:
      'Nothing purchasable is ever hard-deleted — order items and entitlements reference ' +
      'products with ON DELETE RESTRICT. Archiving is reversible via /restore.',
  })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.archive(id, actorFrom(user, request));
  }

  @Post(':id/restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.restore(id, actorFrom(user, request));
  }

  // --- assets -------------------------------------------------------------

  @Post(':id/assets')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a new version of an asset',
    description:
      'Never overwrites. The previous version is retained and this one becomes current, ' +
      'so a buyer mid-download is unaffected and a mistaken replacement can be rolled back.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadAssetDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file was uploaded under the field name "file".');
    }

    return this.assets.upload(
      {
        productId: id,
        kind: dto.kind,
        content: file.buffer,
        originalFilename: file.originalname,
        // The browser-supplied type is checked against the asset kind in the
        // service; it is a hint, not a guarantee.
        mimeType: file.mimetype,
        pageCount: dto.pageCount,
      },
      actorFrom(user, request),
    );
  }

  @Get('assets/:assetId/preview-url')
  @ApiOperation({ summary: 'A short-lived link so an admin can check what was uploaded' })
  async previewAsset(@Param('assetId', ParseUUIDPipe) assetId: string) {
    return { url: await this.assets.getAdminSignedUrl(assetId) };
  }

  @Post('assets/:assetId/make-current')
  @ApiOperation({ summary: 'Roll back to an earlier version of an asset' })
  makeCurrent(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.assets.makeCurrent(assetId, actorFrom(user, request));
  }

  // --- taxonomy + links ---------------------------------------------------

  @Put(':id/terms')
  @ApiOperation({
    summary: 'Replace the product’s taxonomy terms',
    description: 'Set semantics: the submitted list becomes the complete set.',
  })
  @HttpCode(204)
  async setTerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductTermsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.taxonomy.setProductTerms(id, dto.termIds, actorFrom(user, request));
  }

  @Post(':id/links')
  addLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductLinkDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.addLink(id, dto, actorFrom(user, request));
  }

  @Delete(':id/links/:linkId')
  @HttpCode(204)
  async removeLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.products.removeLink(id, linkId, actorFrom(user, request));
  }

  @Post(':id/links/:linkId/restore')
  restoreLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.restoreLink(id, linkId, actorFrom(user, request));
  }
}
