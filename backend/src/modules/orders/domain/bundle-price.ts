/**
 * What a buyer pays for a bundle when they already hold some of its PDFs:
 * the bundle's price shared equally across its PDFs, charged only for the ones
 * they do not have, rounded to the whole rupee (half up).
 *
 *   ₹199 for 5 PDFs, already holding 2  →  199 × 3 / 5 = 119.4  →  ₹119
 *
 * Holding none: the full price. Holding all: zero — the caller refuses that
 * purchase rather than selling nothing. The order records the full price as
 * the subtotal and the difference as its discount, so the invoice says why.
 */
export function bundlePayableMinor(priceMinor: bigint, totalPdfs: number, ownedPdfs: number): bigint {
  if (totalPdfs <= 0) return priceMinor;
  const owned = BigInt(Math.min(Math.max(ownedPdfs, 0), totalPdfs));
  const total = BigInt(totalPdfs);
  if (owned === 0n) return priceMinor;
  const remaining = total - owned;
  // Rupees = price × remaining / total / 100, rounded half up, back in paise.
  const rupees = (priceMinor * remaining + 50n * total) / (100n * total);
  return rupees * 100n;
}
