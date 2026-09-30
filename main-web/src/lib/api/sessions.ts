import { api } from "./client";
import type {
  CheckoutResult,
  MyRegistration,
  RegistrationAnswers,
  SessionLanding,
} from "./types";

export const sessionsApi = {
  landing: () => api.getAnonymous<SessionLanding>("/sessions"),

  options: () =>
    api.getAnonymous<{ exams: string[]; stages: string[] }>("/sessions/registration-options"),

  mine: (sessionId: string) => api.get<MyRegistration>(`/sessions/${sessionId}/registration`),

  /** Saves the answers and opens a Razorpay order. The price comes from the server, never from here. */
  register: (sessionId: string, answers: RegistrationAnswers) =>
    api.post<CheckoutResult>(`/sessions/${sessionId}/register`, answers),

  verifyPayment: (payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => api.post<{ orderId: string; status: string }>("/payments/verify", payload),

  /** Development only: settles a PAYMENT_DRIVER=stub order. The API answers 404 otherwise. */
  simulatePayment: (orderId: string) =>
    api.post<{ success: boolean }>(`/orders/${orderId}/simulate-payment`, { outcome: "success" }),
};
