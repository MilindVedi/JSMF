// Single source of truth for the upcoming JSMF live session.
// Update these values when a new session is announced.

export type SessionEvent = {
  title: string;
  tagline: string;
  /** ISO date-time in IST */
  startsAt: string;
  dateLabel: string;
  timeLabel: string;
  platform: string;
  seatsNote: string;
  /** Update this number as registrations fill up. */
  seatsRemaining: number;
  learn: string[];
  perk: string;
  /** Set to false to retire the session without deleting it. */
  published: boolean;
  recordingUrl?: string;
};

export const upcomingSession: SessionEvent = {
  title: "From MBBS to Your Dream Rank: How to Prepare Smarter, Not Longer",
  tagline:
    "A live, no-fluff session with Dr. Angad Rai on building a revision system that actually holds until exam day.",
  startsAt: "2026-10-12T19:30:00+05:30",
  dateLabel: "Sunday, 12 October 2026",
  timeLabel: "7:30 PM IST · 90 minutes",
  platform: "Live on Zoom · Link sent on mail",
  seatsNote: "Free to attend · Limited seats",
  seatsRemaining: 37,
  learn: [
    "🧠 High-Yield Concepts Across All 19 Subjects",
    "🎯 Difficult & Unfamiliar Question Approach",
    "⚠️ Common Mistakes & Confusing Concepts",
    "💬 Live Interaction & Doubt Solving",
    "🚀 Exam-Day Confidence & Strategy",
  ],
  perk: "Get Dr. Angad's High-Yield Revision Planner — FREE",
  published: true,
};

export const isSessionUpcoming = (event: SessionEvent) =>
  event.published && new Date(event.startsAt).getTime() > Date.now();

export const links = {
  telegram: "https://t.me/jsmfresources",
  youtube: "https://www.youtube.com/@jsmf",
  instagram: "https://www.instagram.com/jsmf",
  interviewWatch: "https://www.youtube.com/live/MMLKjFlV1tA",
  interviewEmbed: "https://www.youtube.com/embed/MMLKjFlV1tA",
};
