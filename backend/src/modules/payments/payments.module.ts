import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { PaymentProvider } from './domain/payment-provider.port';
import { RazorpayPaymentAdapter } from './infrastructure/razorpay-payment.adapter';
import { StubPaymentAdapter } from './infrastructure/stub-payment.adapter';

/**
 * Payments, assembled from configuration.
 *
 * Only one adapter is bound to the port at a time — unlike storage, where every
 * adapter stays reachable. The difference is that a stored file's location is a
 * historical fact that outlives a config change, whereas a payment is always
 * transacted with whoever is live now. Past payments record their provider in
 * the `payments.provider` column for audit, but nothing needs to call a
 * provider that is no longer in use.
 *
 * Adding Stripe or Cashfree later: one new class extending `PaymentProvider`,
 * one value in the enum, one line in the factory.
 */
@Module({
  providers: [
    // Both are constructed — neither constructor has side effects or touches
    // the network — so the factory is a pure selection rather than a branch
    // that could fail to build the one it needs.
    StubPaymentAdapter,
    RazorpayPaymentAdapter,
    {
      provide: PaymentProvider,
      useFactory: (
        config: AppConfig,
        stub: StubPaymentAdapter,
        razorpay: RazorpayPaymentAdapter,
      ): PaymentProvider => (config.get('PAYMENT_DRIVER') === 'razorpay' ? razorpay : stub),
      inject: [AppConfig, StubPaymentAdapter, RazorpayPaymentAdapter],
    },
  ],
  // The stub is exported concretely as well, so a development-only route can
  // trigger a simulated webhook. Nothing in the checkout path may depend on it.
  exports: [PaymentProvider, StubPaymentAdapter],
})
export class PaymentsModule {}
