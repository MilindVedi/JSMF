/**
 * At most `limit` units per fixed window, for this process.
 *
 * The per-caller throttle bounds what one address can send. This bounds what
 * everyone together can make this instance write, so a flood from many
 * addresses costs a bounded number of log lines rather than an unbounded
 * logging bill. In memory on purpose: it is a ceiling, not an exact quota.
 */
export class WindowBudget {
  private windowStart = 0;
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes up to `wanted` units; returns how many were granted. */
  take(wanted: number): number {
    const now = this.now();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.used = 0;
    }
    const granted = Math.max(0, Math.min(wanted, this.limit - this.used));
    this.used += granted;
    return granted;
  }

  /** True once per window, the first time it is asked after the budget ran out. */
  private warnedWindow = -1;
  shouldWarn(): boolean {
    if (this.used < this.limit || this.warnedWindow === this.windowStart) return false;
    this.warnedWindow = this.windowStart;
    return true;
  }
}
