import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { plainTextBody } from '../../common/middleware/plain-text-body';
import { ClientErrorIntakeService } from './application/client-error-intake.service';
import { MAX_BODY_BYTES } from './domain/client-error';
import { ClientErrorsController } from './http/client-errors.controller';

/**
 * Crash reports from the websites and the phone app, written to the log as
 * Error Reporting events. See docs/observability/README.md.
 */
@Module({
  controllers: [ClientErrorsController],
  providers: [ClientErrorIntakeService],
})
export class ClientErrorsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(plainTextBody(MAX_BODY_BYTES)).forRoutes({ path: 'client-errors', method: RequestMethod.POST });
  }
}
