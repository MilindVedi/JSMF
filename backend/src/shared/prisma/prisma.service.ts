import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { connectTimeoutSeconds, withConnectTimeout } from './database-url';

/**
 * The client options. A function, not inline, because the class has field
 * initialisers, so nothing may run before `super()` in the constructor.
 */
function clientOptions(): Prisma.PrismaClientOptions {
  const url = process.env.DATABASE_URL;
  return {
    // Without a URL Prisma reads DATABASE_URL itself and reports it missing.
    ...(url
      ? { datasourceUrl: withConnectTimeout(url, connectTimeoutSeconds(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS)) }
      : {}),
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(clientOptions());
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
