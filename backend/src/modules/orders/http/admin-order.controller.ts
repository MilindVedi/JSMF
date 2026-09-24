import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { OrderService } from '../application/order.service';
import { PaymentService } from '../application/payment.service';
import { AdminOrderQueryDto, RefundOrderDto } from './dto/admin-order.dto';

/**
 * Platform-wide order visibility and refunds. Financially sensitive, so
 * restricted to ADMIN only — unlike catalog management, EDUCATOR does not
 * get this.
 */
@ApiTags('admin: orders')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List orders across every customer' })
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.listForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one order, any customer' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findForAdmin(id);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refund an order and revoke the entitlements it granted' })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RefundOrderDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.payments.refund(id, admin.id, body.reason);
  }
}
