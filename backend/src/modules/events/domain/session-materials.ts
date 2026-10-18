/**
 * Who gets a session day's materials. Pure: no database, no clock of its own.
 *
 * A seat holder is entitled to a day's materials when either
 *   - the session gives late joiners earlier days' materials, or
 *   - that day had not ended when they joined (paid).
 *
 * So someone who paid before the session gets every day either way; the
 * setting only changes things for people who paid once a day was over. The
 * day in progress when they paid counts as theirs — they could still attend it.
 */
export interface MaterialDay {
  startsAt: Date;
  durationMinutes: number;
}

export function dayEndsAt(day: MaterialDay): Date {
  return new Date(day.startsAt.getTime() + day.durationMinutes * 60_000);
}

export function entitledToDay(day: MaterialDay, joinedAt: Date, lateJoinersGetEarlier: boolean): boolean {
  return lateJoinersGetEarlier || dayEndsAt(day).getTime() > joinedAt.getTime();
}

/**
 * The pairs that should have access: one per (seat holder, product). A product
 * attached to two days counts once, and is due when either day is.
 */
export function desiredAccess<H extends { userId: string; joinedAt: Date }>(
  holders: H[],
  materials: Array<{ productId: string; day: MaterialDay }>,
  lateJoinersGetEarlier: boolean,
): Map<string, { holder: H; productIds: Set<string> }> {
  const byUser = new Map<string, { holder: H; productIds: Set<string> }>();
  for (const holder of holders) {
    const productIds = new Set<string>();
    for (const material of materials) {
      if (entitledToDay(material.day, holder.joinedAt, lateJoinersGetEarlier)) productIds.add(material.productId);
    }
    byUser.set(holder.userId, { holder, productIds });
  }
  return byUser;
}
