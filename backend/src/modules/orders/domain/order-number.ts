import type { PrismaService } from '../../../shared/prisma/prisma.service';

/**
 * `JSMF-2026-000412`, from a Postgres sequence.
 *
 * Not `max(order_number) + 1`: two checkouts in the same instant would read
 * the same maximum and one would then collide on the UNIQUE constraint. A
 * sequence is contention-free and needs no retry loop. Gaps from rolled-back
 * transactions are fine — this is an identifier to read aloud in support, not
 * a count of orders.
 *
 * Shared by checkout and by offline sales, so every order is numbered alike.
 */
export async function nextOrderNumber(tx: { $queryRaw: PrismaService['$queryRaw'] }): Promise<string> {
  const [row] = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('order_number_seq') AS nextval
  `;

  return `JSMF-${new Date().getFullYear()}-${String(row.nextval).padStart(6, '0')}`;
}
