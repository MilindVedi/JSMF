import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrderEvents } from './application/order-events';
import { OrderService } from './application/order.service';
import { PaymentService } from './application/payment.service';
import { PaymentReconciliationService } from './application/reconciliation.service';
import { AdminOrderController } from './http/admin-order.controller';
import { OrderController } from './http/order.controller';
import { ReconciliationController } from './http/reconciliation.controller';
import { WebhookController } from './http/webhook.controller';

/**
 * Selling: orders, payments, and the provider webhook.
 *
 * Depends on `entitlements` and not the other way round — acquiring access is
 * this module's job, defining it is not. It talks to the payment provider only
 * through the `PaymentProvider` port, so Razorpay appears nowhere in the
 * checkout logic itself.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, EntitlementsModule],
  controllers: [
    OrderController,
    WebhookController,
    AdminOrderController,
    ReconciliationController,
  ],
  providers: [OrderService, PaymentService, PaymentReconciliationService, OrderEvents],
  exports: [OrderService, PaymentService, OrderEvents],
})
export class OrdersModule {}
