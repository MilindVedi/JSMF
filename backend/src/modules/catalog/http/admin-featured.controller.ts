import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { ProductService } from '../application/product.service';
import { actorFrom } from './actor';
import { SetFeaturedDto } from './dto/product.dto';

/**
 * Curating the landing page's featured strip.
 *
 * Its own controller rather than two more routes on `admin/products`, because
 * `admin/products/featured` would sit under that controller's `:id` route and
 * work only by being declared above it — a correctness property invisible at
 * the call site and quietly broken by reordering methods.
 */
@ApiTags('admin: catalog')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/featured')
export class AdminFeaturedController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @ApiOperation({
    summary: 'The featured list as arranged',
    description:
      'Includes featured products that are not currently published. Those keep their slot ' +
      'but do not appear on the storefront, and hiding them here would leave an admin ' +
      'unable to explain why the site shows fewer resources than this screen does.',
  })
  list() {
    return this.products.findFeaturedForAdmin();
  }

  @Put()
  @ApiOperation({
    summary: 'Replace the featured list',
    description:
      'These products, in this order, and nothing else. Positions are renumbered from zero ' +
      'on save, so gaps and duplicates cannot accumulate. An empty array clears the section.',
  })
  set(
    @Body() dto: SetFeaturedDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.setFeatured(dto.productIds, actorFrom(user, request));
  }
}
