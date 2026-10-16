import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OfflineSaleEntry } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { OfflineSaleService } from '../application/offline-sale.service';
import { OfflineSalePreviewDto, RecordOfflineSalesDto } from './dto/offline-sale.dto';

/**
 * Buyers who paid outside checkout, added by hand. Money, so ADMIN only —
 * like refunds, and unlike the session editor, which EDUCATOR may use.
 */
@ApiTags('admin: offline sales')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/products/:productId/offline-sales')
export class AdminOfflineSaleController {
  constructor(private readonly sales: OfflineSaleService) {}

  @Get()
  @ApiOperation({ summary: 'Buyers recorded by hand for this product, in payment order' })
  list(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.sales.list(productId);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check a list of buyers and show what recording it would do. Writes nothing.' })
  preview(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: OfflineSalePreviewDto) {
    return this.sales.preview(productId, dto.buyers);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record buyers who paid outside checkout',
    description:
      'Refuses the whole list if any row has a mistake. Otherwise records each buyer in their own ' +
      'transaction, skips anyone who already has access, and sends no email.',
  })
  record(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RecordOfflineSalesDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sales.record(productId, dto.buyers, {
      userId: admin.id,
      ip: request.ip ?? null,
      entry: dto.entry === 'FILE' ? OfflineSaleEntry.FILE : OfflineSaleEntry.FORM,
    });
  }
}
