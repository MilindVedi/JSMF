import { api } from "./client";
import type { CheckoutResult } from "./types";

/**
 * One-to-one calls (backend: /mentorship, /mentorship-bookings).
 * Money is minor units as a string; times are ISO instants, and every label
 * the page shows is formatted in the offering's own timezone.
 */

export interface MentorshipOffering {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  durationMinutes: number;
  timezone: string;
  bookingWindowDays: number;
  rescheduleCutoffMinutes: number;
  platformLabel: string;
  highlights: string[];
}

export interface OpenSlot {
  startsAt: string;
  endsAt: string;
}

export interface SlotList {
  timezone: string;
  durationMinutes: number;
  slots: OpenSlot[];
}

export interface HoldInput {
  startsAt: string;
  attendeeName: string;
  whatsappNumber: string;
  exam: string;
  notes?: string;
}

export type HoldResult = CheckoutResult & { bookingId: string; holdExpiresAt: string };

export type MyBookingStatus = "CONFIRMED" | "PAID_UNSCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface MyBooking {
  id: string;
  status: MyBookingStatus;
  startsAt: string;
  endsAt: string;
  whenLabel: string;
  meetUrl: string | null;
  attendeeName: string;
  offering: { slug: string; title: string; platformLabel: string; durationMinutes: number; timezone: string };
  canReschedule: boolean;
  rescheduleBlockedReason: string | null;
  reschedulesLeft: number;
  orderNumber: string | null;
}

export const mentorshipApi = {
  list: () => api.getAnonymous<MentorshipOffering[]>("/mentorship"),
  options: () => api.getAnonymous<{ exams: string[] }>("/mentorship/options"),
  slots: (slug: string) => api.getAnonymous<SlotList>(`/mentorship/${encodeURIComponent(slug)}/slots`),
  /** Holds the slot and opens a Razorpay order. The price comes from the server, never from here. */
  hold: (slug: string, input: HoldInput) => api.post<HoldResult>(`/mentorship/${encodeURIComponent(slug)}/bookings`, input),

  mine: () => api.get<MyBooking[]>("/mentorship-bookings"),
  rescheduleSlots: (id: string) => api.get<SlotList>(`/mentorship-bookings/${id}/slots`),
  reschedule: (id: string, startsAt: string) => api.post<MyBooking>(`/mentorship-bookings/${id}/reschedule`, { startsAt }),
};

/**
 * The offering the site shows (the first published one), fetched once per
 * page load and shared — the header link and the home banner both ask, and
 * neither should cost a second request. Null when none is published or the
 * request fails: the feature then simply does not appear.
 */
let current: Promise<MentorshipOffering | null> | null = null;

export function currentOffering(): Promise<MentorshipOffering | null> {
  current ??= mentorshipApi
    .list()
    .then((list) => list[0] ?? null)
    .catch(() => {
      current = null; // let a later caller try again
      return null;
    });
  return current;
}
