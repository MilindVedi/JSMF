import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AppConfig } from '../../../config/config.module';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { OrderService } from '../application/order.service';
import { PaymentService } from '../application/payment.service';
import { AdminOrderQueryDto, ManualRefundDto, RefundOrderDto, RevokeAccessDto } from './dto/admin-order.dto';

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
    private readonly config: AppConfig,
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
  @ApiOperation({
    summary: 'Refund an order through Razorpay, in full or in part',
    description:
      'Disabled while REFUNDS_ENABLED is false — answers 409 rather than touching Razorpay. ' +
      'Access is revoked when revokeAccess is true, or when it is omitted and the refund completes the full amount.',
  })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RefundOrderDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (!this.config.get('REFUNDS_ENABLED')) {
      throw new ConflictException(
        'Refunds are temporarily disabled. A refund issued directly in the Razorpay dashboard still revokes the buyer’s access as usual.',
      );
    }

    return this.payments.refund(id, admin.id, body.reason, body.speed ?? 'NORMAL', {
      amountMinor: body.amountMinor === undefined ? undefined : BigInt(body.amountMinor),
      revokeAccess: body.revokeAccess,
      notifyBuyer: body.notifyBuyer,
    });
  }

  /**
   * Not gated by REFUNDS_ENABLED: that switch protects the Razorpay call, and
   * this one makes none — the money has already gone back by UPI, bank or cash.
   */
  @Post(':id/manual-refund')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record a refund already made outside Razorpay (UPI, bank, cash)',
    description: 'Full or partial. Access is revoked only if revokeAccess is true.',
  })
  recordManualRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ManualRefundDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.payments.recordManualRefund(id, admin.id, {
      amountMinor: BigInt(body.amountMinor),
      method: body.method,
      reference: body.reference,
      refundedAt: new Date(body.refundedAt),
      reason: body.reason,
      revokeAccess: body.revokeAccess,
      notifyBuyer: body.notifyBuyer ?? true,
    });
  }

  @Post(':id/revoke-access')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take away what an order gave, without moving money',
    description: 'Also cancels a booked one-to-one call on the order. The buyer is not emailed.',
  })
  revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevokeAccessDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.payments.revokeAccess(id, admin.id, body.reason);
  }
}
