/**
 * What a question filter (exam, subject, topic) offers: only what has
 * published questions — ticking an empty one would just show nothing. One
 * rule for web's FilterPanel and the app's FilterBar.
 *
 * Anything already selected stays, so a filter carried over from before (a
 * target exam, a remembered choice) can still be seen and unticked. An item
 * without a count — web's demo data doesn't give one for exams or topics —
 * is kept: unknown is not empty.
 */
export function offeredInFilter<T extends { id: string; questionCount?: number }>(
  items: readonly T[],
  selected: readonly string[],
): T[] {
  return items.filter(
    (item) => item.questionCount === undefined || item.questionCount > 0 || selected.includes(item.id),
  );
}
