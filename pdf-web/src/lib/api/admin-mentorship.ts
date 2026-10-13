import { api } from "./client";
import type { ProductStatus } from "./types";

/**
 * One-to-one calls (backend: /admin/mentorship). Money is minor units as a
 * string, times are ISO instants; the weekly hours and dated exceptions are in
 * the offering's own timezone, as minutes after local midnight.
 */

export type MentorshipBookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PAID_UNSCHEDULED"
  | "EXPIRED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type BookingView = "upcoming" | "attention" | "past" | "cancelled" | "all";

export interface WeeklyRule {
  id?: string;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityException {
  id: string;
  /** YYYY-MM-DD in the offering's timezone. */
  date: string;
  kind: "BLOCK" | "EXTRA";
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}

export interface AdminOffering {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  rescheduleCutoffMinutes: number;
  maxReschedules: number;
  platformLabel: string;
  highlights: string[];
  status: ProductStatus;
  rules: WeeklyRule[];
  upcomingBookings: number;
  needsAttention: number;
}

export interface OfferingInput {
  title?: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  timezone?: string;
  minNoticeMinutes?: number;
  bookingWindowDays?: number;
  rescheduleCutoffMinutes?: number;
  maxReschedules?: number;
  platformLabel?: string;
  highlights?: string[];
}

export interface AdminBooking {
  id: string;
  status: MentorshipBookingStatus;
  startsAt: string;
  endsAt: string;
  whenLabel: string;
  attendeeName: string;
  email: string | null;
  accountName: string;
  whatsappNumber: string | null;
  exam: string;
  notes: string | null;
  meetUrl: string | null;
  rescheduleCount: number;
  offering: { id: string; title: string; timezone: string };
  order: { id: string; orderNumber: string; status: string; totalAmountMinor: string; currency: string } | null;
  confirmedAt: string | null;
  confirmationSentAt: string | null;
  meetLinkSentAt: string | null;
  reminderSentAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface OpenSlots {
  timezone: string;
  slots: Array<{ startsAt: string; endsAt: string }>;
}

export const adminMentorshipApi = {
  offerings: () => api.get<AdminOffering[]>("/admin/mentorship/offerings"),
  offering: (id: string) => api.get<AdminOffering>(`/admin/mentorship/offerings/${id}`),
  create: (input: OfferingInput) => api.post<AdminOffering>("/admin/mentorship/offerings", input),
  update: (id: string, input: OfferingInput) => api.patch<AdminOffering>(`/admin/mentorship/offerings/${id}`, input),
  publish: (id: string) => api.post<AdminOffering>(`/admin/mentorship/offerings/${id}/publish`),
  unpublish: (id: string) => api.post<AdminOffering>(`/admin/mentorship/offerings/${id}/unpublish`),
  replaceRules: (id: string, rules: WeeklyRule[]) =>
    api.put<AdminOffering>(`/admin/mentorship/offerings/${id}/rules`, {
      rules: rules.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
    }),
  exceptions: (id: string) => api.get<AvailabilityException[]>(`/admin/mentorship/offerings/${id}/exceptions`),
  addException: (id: string, input: Omit<AvailabilityException, "id">) =>
    api.post<AvailabilityException>(`/admin/mentorship/offerings/${id}/exceptions`, input),
  removeException: (id: string, exceptionId: string) =>
    api.delete<void>(`/admin/mentorship/offerings/${id}/exceptions/${exceptionId}`),
  previewSlots: (id: string) => api.get<OpenSlots>(`/admin/mentorship/offerings/${id}/slots`),

  bookings: (view: BookingView) => api.get<AdminBooking[]>(`/admin/mentorship/bookings?view=${view}`),
  booking: (id: string) => api.get<AdminBooking>(`/admin/mentorship/bookings/${id}`),
  setMeetLink: (id: string, meetUrl: string | null) =>
    api.patch<AdminBooking>(`/admin/mentorship/bookings/${id}/meet-link`, { meetUrl }),
  reschedule: (id: string, startsAt: string) =>
    api.post<AdminBooking>(`/admin/mentorship/bookings/${id}/reschedule`, { startsAt }),
  setStatus: (id: string, status: "COMPLETED" | "NO_SHOW" | "CANCELLED", reason?: string, notify = true) =>
    api.post<AdminBooking>(`/admin/mentorship/bookings/${id}/status`, { status, reason, notify }),
};

/** 1140 → "19:00" — the value an `<input type="time">` takes. */
export function minuteToTime(minute: number): string {
  if (minute >= 1440) return "24:00";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "19:00" → 1140. "00:00" as an end time means midnight at the end of the day. */
export function timeToMinute(time: string, isEnd = false): number {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes;
  return isEnd && total === 0 ? 1440 : total;
}

/** 1140 → "7:00 pm", for reading rather than editing. */
export function minuteLabel(minute: number): string {
  if (minute >= 1440) return "midnight";
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
