import { describe, expect, it } from 'vitest';
import { ipMatchesAllowlist, parseIpAllowlist } from './ip-allowlist';

/**
 * What is being protected here is the direction of failure. An allowlist that
 * wrongly admits is a hole; an allowlist that wrongly refuses costs a
 * settlement. Both directions are asserted, and anything unparseable must land
 * on "refuse" rather than slip through as a match.
 */
describe('webhook IP allowlist', () => {
  const allow = (entries: string[], ip: string | undefined) =>
    ipMatchesAllowlist(ip, parseIpAllowlist(entries).ranges);

  it('matches a bare address exactly', () => {
    expect(allow(['52.66.75.174'], '52.66.75.174')).toBe(true);
    expect(allow(['52.66.75.174'], '52.66.75.175')).toBe(false);
  });

  it('matches inside a CIDR range and not outside it', () => {
    expect(allow(['52.66.0.0/16'], '52.66.75.174')).toBe(true);
    expect(allow(['52.66.0.0/16'], '52.67.0.1')).toBe(false);
  });

  it('handles the high-bit ranges that signed shifts get wrong', () => {
    // 128.0.0.0/1 sets the top bit; without an unsigned shift this compares a
    // negative number and never matches.
    expect(allow(['128.0.0.0/1'], '200.1.2.3')).toBe(true);
    expect(allow(['128.0.0.0/1'], '127.0.0.1')).toBe(false);
  });

  it('reads an IPv4 client reported in IPv6-mapped form', () => {
    // How Node reports an IPv4 caller on a dual-stack socket. Missing this
    // would refuse every genuine delivery.
    expect(allow(['52.66.0.0/16'], '::ffff:52.66.75.174')).toBe(true);
  });

  it('refuses what it cannot read, rather than admitting it', () => {
    expect(allow(['52.66.0.0/16'], undefined)).toBe(false);
    expect(allow(['52.66.0.0/16'], '')).toBe(false);
    expect(allow(['52.66.0.0/16'], '2405:200::1')).toBe(false);
    expect(allow(['52.66.0.0/16'], 'not-an-ip')).toBe(false);
    // Leading zeros read as octal by some parsers; two readings of one address
    // is how an allowlist gets walked past.
    expect(allow(['52.66.75.174'], '52.66.75.0174')).toBe(false);
    expect(allow(['52.66.75.174'], '52.66.75.174.5')).toBe(false);
  });

  it('reports bad entries instead of silently narrowing the list', () => {
    const { ranges, invalid } = parseIpAllowlist(['52.66.0.0/16', '52.66.0.0/33', 'nonsense']);
    expect(ranges).toHaveLength(1);
    expect(invalid).toEqual(['52.66.0.0/33', 'nonsense']);
  });

  it('admits nobody when nothing is configured, so the caller must opt out explicitly', () => {
    // The guard treats an empty list as "allowlisting is off" before it ever
    // calls this; the matcher itself must never be the thing that says yes.
    expect(allow([], '52.66.75.174')).toBe(false);
  });
});
