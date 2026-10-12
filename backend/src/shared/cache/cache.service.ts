import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../../config/config.module';

/** Every key is namespaced, so the Redis instance can be shared safely. */
const PREFIX = 'jsmf:cache:';

/** The in-memory store's ceiling. Oldest entries go first past it. */
const MEMORY_MAX_ENTRIES = 10_000;

interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  close(): Promise<void>;
}

/**
 * This process's memory: correct for exactly one API instance, and free.
 * A Map keeps insertion order, so evicting the first key is evicting the oldest.
 */
class MemoryStore implements Store {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.delete(key);
    if (this.entries.size >= MEMORY_MAX_ENTRIES) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(keys: string[]) {
    for (const key of keys) this.entries.delete(key);
  }

  async close() {}
}

/** Shared by every API instance, so an invalidation on one is seen by all. */
class RedisStore implements Store {
  constructor(private readonly client: Redis) {}

  get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(keys: string[]) {
    if (keys.length) await this.client.del(...keys);
  }

  // `disconnect`, not `quit`: quit needs a live connection, and with Redis
  // down it would leave the reconnect loop running and hold up shutdown.
  async close() {
    this.client.disconnect();
  }
}

/**
 * Read-through cache for values that are expensive to compute and cheap to be
 * briefly stale. Backed by this process's memory, or by Redis when
 * REDIS_ENABLED=true — the same switch that moves rate-limit counters there.
 *
 * A cache must never be the reason a request fails: if Redis is unreachable,
 * reads fall through to the loader and writes are skipped, and the request is
 * served from the database as if nothing were cached.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly store: Store;
  readonly driver: 'memory' | 'redis';

  constructor(config: AppConfig) {
    if (config.get('REDIS_ENABLED')) {
      const client = new Redis(config.get('REDIS_URL')!, {
        // Fail a command fast rather than queueing it while disconnected: a
        // slow cache is worse than none, since the loader is always there.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      });
      client.on('error', (error) => this.logger.warn(`Redis cache unavailable: ${error.message}`));
      this.store = new RedisStore(client);
      this.driver = 'redis';
    } else {
      this.store = new MemoryStore();
      this.driver = 'memory';
    }
  }

  /**
   * The cached value, or the loader's — which is then cached for `ttlSeconds`.
   * Values round-trip through JSON: cache only plain data (ISO strings, not
   * Dates; strings, not BigInts).
   */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.store.get(PREFIX + key).catch(() => null);
    if (cached !== null) return JSON.parse(cached) as T;

    const value = await loader();
    await this.store.set(PREFIX + key, JSON.stringify(value), ttlSeconds).catch(() => undefined);
    return value;
  }

  /** Drops keys after a write that makes them wrong. Best effort, like every cache call. */
  async del(...keys: string[]): Promise<void> {
    await this.store.del(keys.map((key) => PREFIX + key)).catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.store.close().catch(() => undefined);
  }
}
