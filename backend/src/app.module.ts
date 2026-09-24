import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppConfig, AppConfigModule } from './config/config.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './shared/audit/audit.service';
import { MailModule } from './shared/mail/mail.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StorageModule } from './modules/storage/storage.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Timers for in-process background work. V1's only job is the payment
    // reconciliation sweep, which is small enough not to justify a queue.
    ScheduleModule.forRoot(),
    // A baseline limit on every route. Auth endpoints tighten this further
    // with their own @Throttle decorators.
    //
    // Storage is where Redis plugs in. Left unset, the throttler keeps counters
    // in this process's memory, which is correct for exactly one API instance —
    // the V1 deployment. With REDIS_ENABLED=true the same counters move to
    // Redis and are shared across instances. Nothing else in the application
    // changes: no decorator, no guard, no call site.
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        storage: config.get('REDIS_ENABLED')
          ? new ThrottlerStorageRedisService(config.get('REDIS_URL'))
          : undefined,
      }),
    }),
    AuditModule,
    MailModule,
    IdentityModule,
    StorageModule,
    PaymentsModule,
    CatalogModule,
    EntitlementsModule,
    OrdersModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttling runs first (cheapest, and should apply to
    // unauthenticated floods too), then authentication, then authorisation.
    // RolesGuard depends on JwtAuthGuard having already populated request.user.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
