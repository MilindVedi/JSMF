import { z } from 'zod';

/**
 * Environment is validated once, at boot, and the process refuses to start if
 * anything is missing or malformed. The alternative — discovering a missing
 * key the first time someone tries to pay — is not a tradeoff worth making.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('.storage'),
    STORAGE_SIGNING_SECRET: z.string().min(16),
    STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    GCS_PROJECT_ID: z.string().optional(),
    GCS_PRIVATE_BUCKET: z.string().default('jsmf-private-content'),
    GCS_PUBLIC_BUCKET: z.string().default('jsmf-public-assets'),
    GCS_KEY_FILE: z.string().optional(),

    PAYMENT_DRIVER: z.enum(['stub', 'razorpay']).default('stub'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STUB_PAYMENT_SECRET: z.string().min(16),

    SEED_ADMIN_EMAIL: z.string().email().default('admin@jsmf.local'),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
    SEED_ADMIN_NAME: z.string().default('JSMF Admin'),
  })
  // Credentials are only demanded of the driver actually selected, so the whole
  // system runs on stubs until real accounts exist — but the moment a driver is
  // switched on, its configuration is mandatory rather than silently absent.
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'gcs') {
      for (const key of ['GCS_PROJECT_ID', 'GCS_KEY_FILE'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=gcs`,
          });
        }
      }
    }

    if (env.PAYMENT_DRIVER === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_DRIVER=razorpay`,
          });
        }
      }
    }

    if (env.NODE_ENV === 'production') {
      if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'Access and refresh secrets must differ in production',
        });
      }
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message:
            'STORAGE_DRIVER=local is a development-only adapter and must not be used in production',
        });
      }
      if (env.PAYMENT_DRIVER === 'stub') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_DRIVER'],
          message:
            'PAYMENT_DRIVER=stub simulates payments and must not be used in production',
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
