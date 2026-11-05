/**
 * "month", "3 months", "year" — the length of one plan purchase, as a price
 * reads it ("₹999/3 months"). Months come from the plan itself; older
 * day-based plans fall back to their period hint, then to days.
 */
export function planPeriodLabel(plan: {
  durationMonths: number | null;
  durationDays: number;
  period?: string | null;
}): string {
  const months = plan.durationMonths;
  if (months) {
    if (months === 1) return "month";
    if (months === 12) return "year";
    if (months % 12 === 0) return `${months / 12} years`;
    return `${months} months`;
  }
  const legacy: Record<string, string> = { month: "month", quarter: "3 months", year: "year" };
  return (plan.period && legacy[plan.period]) ?? `${plan.durationDays} days`;
}
