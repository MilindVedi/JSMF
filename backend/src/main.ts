import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';

/**
 * Money is stored as BigInt (minor units) throughout, and JSON.stringify throws
 * on BigInt by default. Serialising as a Number would silently lose precision
 * above 2^53; serialising as a string keeps every amount exact and forces the
 * client to parse it deliberately.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(
  this: bigint,
) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // The raw body is required to verify payment webhook signatures: the HMAC is
    // computed over the exact bytes the provider sent, and any re-serialisation
    // of the parsed object would change them.
    rawBody: true,
  });

  const config = app.get(AppConfig);
  const logger = new Logger('Bootstrap');

  // Must be set for rate limiting to see real client addresses: @nestjs/throttler
  // keys its counters on `req.ip`, which is the connecting socket's address
  // unless Express is told a proxy is in front. Behind one, that address is the
  // proxy's and is identical for every user, so the per-IP limits quietly become
  // limits shared by the entire site at once.
  const trustProxyHops = config.get('TRUST_PROXY_HOPS');
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown properties outright rather than stripping them silently,
      // so a client sending `price` to an endpoint that does not accept it finds
      // out immediately instead of wondering why nothing changed.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('JSMF API')
      .setDescription('PDF & digital content platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  app.enableShutdownHooks();

  const port = config.get('PORT');
  await app.listen(port);

  logger.log(`JSMF API listening on http://localhost:${port}/api`);
  // Logged because the wrong value is invisible until it matters: too low and
  // everyone shares a rate-limit bucket, too high and the limits are forgeable.
  // GET /api/health/client-ip is how to check it against a real deployment.
  logger.log(
    trustProxyHops === 0
      ? 'trust proxy: 0 (direct connections — set TRUST_PROXY_HOPS=1 behind Cloud Run)'
      : `trust proxy: ${trustProxyHops} hop(s)`,
  );
  if (!config.isProduction) {
    logger.log(`API docs at http://localhost:${port}/api/docs`);
    logger.log(
      `storage driver: ${config.get('STORAGE_DRIVER')} · payment driver: ${config.get('PAYMENT_DRIVER')}`,
    );
  }
}

void bootstrap();
