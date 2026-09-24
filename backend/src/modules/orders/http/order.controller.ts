import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AppConfig } from '../../../config/config.module';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { OrderService } from '../application/order.service';
import { PaymentService } from '../application/payment.service';
import { CheckoutDto, SimulateCheckoutDto, VerifyPaymentDto } from './dto/checkout.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly config: AppConfig,
    private readonly stub: StubPaymentAdapter,
  ) {}

  @Post('orders')
  @ApiOperation({
    summary: 'Start a checkout',
    description:
      'Creates an order priced from the database. A free product is settled immediately and ' +
      'returns kind=FREE; a paid one returns kind=PAYMENT_REQUIRED with the provider order id ' +
      'and publishable key the checkout widget needs.',
  })
  // Tighter than the global limit: each call creates an order row and hits the
  // payment provider, so it is worth more to abuse than an ordinary read.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.checkout({
      userId: user.id,
      productId: dto.productId,
      // Taken from the authenticated account, not the request body — an
      // invoice address the caller can set freely is a phishing vector.
      customerEmail: user.email,
      customerPhone: dto.customerPhone,
    });
  }

  @Post('payments/verify')
  @ApiOperation({
    summary: 'Confirm a payment from the browser callback',
    description:
      'Unlocks the UI promptly. NOT the authority for access — the webhook is, because a user ' +
      'who closes the tab after paying never calls this. Both paths are idempotent.',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  verify(@Body() dto: VerifyPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.verifyCheckout({
      userId: user.id,
      providerOrderId: dto.razorpayOrderId,
      providerPaymentId: dto.razorpayPaymentId,
      signature: dto.razorpaySignature,
    });
  }

  /**
   * Development only. `PAYMENT_DRIVER=stub` has no real checkout widget to
   * open — Razorpay's own checkout.js rejects the stub's fake key and order id
   * outright, which is what a buyer sees as an immediate "Payment Failed" the
   * moment the widget opens. This exists so the browser flow is exercisable at
   * all under the stub driver, without a Razorpay account or a tunnel.
   *
   * It does not shortcut settlement: it produces the same signature the real
   * checkout widget's `handler` callback would hand the browser
   * (`StubPaymentAdapter.signCheckout`, the same one the integration suite
   * uses) and then drives it through the ordinary `verifyCheckout` — the exact
   * path a real payment takes. Answers 404 unless the stub driver is active,
   * so it is unreachable at all once a real provider is configured.
   */
  @Post('orders/:id/simulate-payment')
  @ApiOperation({
    summary: 'Development only — completes a checkout without a real payment provider',
    description:
      'Only reachable when PAYMENT_DRIVER=stub. Produces a signed callback exactly as the real ' +
      'checkout widget would and settles through the same verifyCheckout path — nothing here ' +
      'bypasses signature verification.',
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async simulatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulateCheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (this.config.get('PAYMENT_DRIVER') !== 'stub') {
      throw new NotFoundException();
    }

    const order = await this.orders.findForUser(user.id, id);
    const payment = order.payments.find((p) => p.providerOrderId);

    if (!payment?.providerOrderId) {
      throw new NotFoundException('No payment record for this order');
    }

    if (dto.outcome === 'failure') {
      return { success: false as const };
    }

    const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const signature = this.stub.signCheckout(payment.providerOrderId, providerPaymentId);

    const settled = await this.payments.verifyCheckout({
      userId: user.id,
      providerOrderId: payment.providerOrderId,
      providerPaymentId,
      signature,
    });

    return { success: true as const, ...settled };
  }

  @Get('orders')
  @ApiOperation({ summary: 'This user’s order history' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.listForUser(user.id);
  }

  @Get('orders/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.findForUser(user.id, id);
  }
}
