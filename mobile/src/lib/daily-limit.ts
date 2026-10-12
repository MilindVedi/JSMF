import { toast } from "./toast";

/**
 * Store rules: the app sells nothing and points nowhere to buy. When the free
 * daily allowance is used up the student is told so, neutrally — no plans,
 * no prices, no upgrade link. (The server's own message mentions upgrading,
 * so it is deliberately not shown.)
 */
export const DAILY_LIMIT_TITLE = "You've used today's free questions";
export const DAILY_LIMIT_MESSAGE = "You've used today's free questions. Come back tomorrow.";

export function notifyDailyLimit(): void {
  toast.info(DAILY_LIMIT_TITLE, "Come back tomorrow.");
}
