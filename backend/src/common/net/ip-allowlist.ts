/**
 * Does a client address fall inside a configured list of IPv4 addresses and
 * CIDR ranges?
 *
 * Deliberately IPv4-only, because what it guards is a published list of a
 * payment provider's egress addresses and those are IPv4. An IPv6 caller is
 * simply not in the list, which is the correct answer for an allowlist: the
 * failure direction is "refused", never "allowed because unparsed".
 *
 * Written here rather than taken from a package: it is thirty lines of bit
 * arithmetic guarding the money path, and a dependency in that position is one
 * whose supply chain becomes ours.
 */

/** A parsed entry: the network address and its mask, both as 32-bit numbers. */
interface Cidr {
  network: number;
  mask: number;
}

/**
 * Turns configured entries into a matcher. Invalid entries are dropped and
 * reported, so a typo in one range cannot be mistaken for a blocked caller —
 * the caller logs what was discarded at boot.
 */
export function parseIpAllowlist(entries: string[]): { ranges: Cidr[]; invalid: string[] } {
  const ranges: Cidr[] = [];
  const invalid: string[] = [];

  for (const entry of entries) {
    const parsed = parseCidr(entry);
    if (parsed) ranges.push(parsed);
    else invalid.push(entry);
  }

  return { ranges, invalid };
}

export function ipMatchesAllowlist(ip: string | undefined, ranges: Cidr[]): boolean {
  const address = toIpv4Number(ip);
  if (address === null) return false;

  // `>>> 0` keeps the result unsigned: a mask of /0 or /1 makes the high bit
  // set, and JavaScript's bitwise operators are otherwise signed.
  return ranges.some((range) => ((address & range.mask) >>> 0) === range.network);
}

function parseCidr(entry: string): Cidr | null {
  const [addressPart, prefixPart] = entry.trim().split('/');
  const address = toIpv4Number(addressPart);
  if (address === null) return null;

  const prefix = prefixPart === undefined ? 32 : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (address & mask) >>> 0, mask };
}

function toIpv4Number(value: string | undefined): number | null {
  if (!value) return null;

  // Node reports an IPv4 client on a dual-stack socket as `::ffff:1.2.3.4`.
  // Without this, every real request would fail to parse and be refused.
  const plain = value.startsWith('::ffff:') ? value.slice(7) : value;

  const octets = plain.split('.');
  if (octets.length !== 4) return null;

  let result = 0;
  for (const octet of octets) {
    // Rejects '', '1e2', '+1' and '01' alike — a leading zero is read as octal
    // by some parsers, and two systems disagreeing about what an address means
    // is how an allowlist gets walked past.
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return null;
    const number = Number(octet);
    if (number > 255) return null;
    result = (result << 8) | number;
  }

  return result >>> 0;
}
