import { z } from "zod";

/**
 * The auth forms' validation, shared so web and mobile reject exactly the same
 * input with the same messages. Each takes `api`: the real identity API
 * (always, on mobile) or web's mock demo mode, which is looser.
 */

export interface AuthSchemaOptions {
  /** True against the real identity API; false for web's mock demo mode. */
  api: boolean;
}

/** The identity API's password policy (the mock demo accepts 6). */
export function minPasswordLength({ api }: AuthSchemaOptions): number {
  return api ? 8 : 6;
}

export function loginSchema({ api }: AuthSchemaOptions) {
  return z.object({
    email: z.string().email("Enter a valid email address"),
    // The real API deliberately has no minimum at login (it would leak policy).
    password: api
      ? z.string().min(1, "Enter your password")
      : z.string().min(6, "Password must be at least 6 characters"),
  });
}

export function signupSchema(options: AuthSchemaOptions) {
  const min = minPasswordLength(options);
  return z
    .object({
      name: z.string().min(2, "Enter your full name"),
      email: z.string().email("Enter a valid email address"),
      password: z.string().min(min, `Password must be at least ${min} characters`),
      // Checked on the device only; one copy of the password is sent.
      confirmPassword: z.string().min(1, "Type your password again"),
      // Which exams exist is data in api mode, so "required" is checked on submit.
      targetExamId: z.string().optional(),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}

export const forgotPasswordSchema = z.object({ email: z.string().email("Enter a valid email address") });

export function resetPasswordSchema(options: AuthSchemaOptions) {
  const { api } = options;
  const min = minPasswordLength(options);
  return z
    .object({
      // Only the real API needs to know whose password, and the emailed code.
      email: api ? z.string().email("Enter a valid email address") : z.string().optional(),
      code: api ? z.string().trim().min(4, "Enter the code from your email") : z.string().optional(),
      password: z.string().min(min, `Password must be at least ${min} characters`),
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}
