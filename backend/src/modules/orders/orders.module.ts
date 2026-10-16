import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PaymentsModule } from '../payments/payments.module';
import { OfflineSaleHandlers } from './application/offline-sale-handlers';
import { OfflineSaleService } from './application/offline-sale.service';
import { OrderEvents } from './application/order-events';
import { OrderService } from './application/order.service';
import { PaymentService } from './application/payment.service';
import { PaymentReconciliationService } from './application/reconciliation.service';
import { AdminOfflineSaleController } from './http/admin-offline-sale.controller';
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
 *
 * Offline sales — money that arrived outside checkout, recorded by an admin —
 * live here too, since they create orders. A product type opts in by
 * registering an OfflineSaleHandler, as it registers for OrderEvents.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, EntitlementsModule],
  controllers: [
    OrderController,
    WebhookController,
    AdminOrderController,
    AdminOfflineSaleController,
    ReconciliationController,
  ],
  providers: [
    OrderService,
    PaymentService,
    PaymentReconciliationService,
    OrderEvents,
    OfflineSaleHandlers,
    OfflineSaleService,
  ],
  exports: [OrderService, PaymentService, OrderEvents, OfflineSaleHandlers, OfflineSaleService],
})
export class OrdersModule {}
