import { Global, Injectable, Logger, Module } from '@nestjs/common';

/** A unit of periodic work: idempotent, safe to run every tick, never throws out. */
export interface Sweep {
  /** Stable key for logs and the trigger's response, e.g. "mentorship". */
  readonly name: string;
  run(): Promise<unknown>;
}

/**
 * Lets a module join the existing 5-minute clock without that clock's owner
 * knowing it exists — the same one-way shape as OrderEvents.
 *
 * There is one external trigger (Cloud Scheduler → /internal/session-reminders,
 * IAM-protected). A new module that needs periodic work registers a sweep here
 * at startup instead of adding a second scheduler job, a second IAM binding and
 * a second endpoint; the trigger runs its own sweeps and then these.
 *
 * Sweeps run one after another, not in parallel: they all write, and a sweep
 * that has to wait a moment is worth more than several contending for rows.
 * A failing sweep is logged and reported, and the rest still run.
 */
@Injectable()
export class SweepRegistry {
  private readonly logger = new Logger(SweepRegistry.name);
  private readonly sweeps: Sweep[] = [];

  register(sweep: Sweep): void {
    if (this.sweeps.some((existing) => existing.name === sweep.name)) {
      throw new Error(`A sweep named "${sweep.name}" is already registered`);
    }
    this.sweeps.push(sweep);
  }

  async runAll(): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    for (const sweep of this.sweeps) {
      try {
        results[sweep.name] = await sweep.run();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        this.logger.error(`Sweep "${sweep.name}" failed: ${message}`);
        results[sweep.name] = { error: message };
      }
    }

    return results;
  }
}

@Global()
@Module({
  providers: [SweepRegistry],
  exports: [SweepRegistry],
})
export class SchedulingModule {}
