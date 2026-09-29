import { z } from 'zod';

/**
 * Values that are obviously stand-ins rather than credentials. Matched against
 * secrets whose driver is actually switched on, where a stand-in does not fail
 * loudly by itself.
 */
const PLACEHOLDER_SECRET = /placeholder|changeme|change_me|your[-_]?(key|secret)|todo|xxxx|<.+>/i;

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

    /// This API's own externally reachable base URL, including the global
    /// prefix. Signed download links produced by the local storage driver point
    /// back here, and they are handed to browsers — so it cannot be inferred
    /// from an inbound request's Host header without trusting that header.
    APP_PUBLIC_URL: z.string().url().default('http://localhost:4000/api'),

    DATABASE_URL: z.string().url(),

    // RS256, not HS256: access tokens are signed with a private key held only
    // by this service, and verified by anyone holding the public key. That is
    // what lets other JSMF applications — and a future standalone auth service
    // — verify a token without ever being trusted with the signing key. Stored
    // base64-encoded so a multi-line PEM survives a single-line .env value.
    JWT_PRIVATE_KEY_BASE64: z.string().min(1),
    JWT_PUBLIC_KEY_BASE64: z.string().min(1),
    /// Identifies which key signed a token, so keys can be rotated later
    /// without invalidating every token in flight.
    JWT_KEY_ID: z.string().default('jsmf-identity-1'),
    JWT_ISSUER: z.string().default('jsmf-identity'),
    JWT_AUDIENCE: z.string().default('jsmf'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    /// Refresh tokens are opaque random strings, not JWTs — the database is
    /// already the source of truth for rotation and revocation, so signing
    /// them would add nothing a lookup does not already provide.
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    /// Upper bound on a single uploaded file. Read directly from process.env by
    /// the upload interceptor as well, because a decorator is evaluated before
    /// dependency injection exists to hand it a config object.
    ///
    /// Defaults to 10 because that is Cloudinary's actual hard ceiling on raw
    /// (non-image) uploads on the free plan — confirmed empirically: a file at
    /// exactly 10,485,760 bytes succeeds, one byte more is rejected. Setting
    /// this higher than the storage backend can accept would let a large file
    /// pass this check, consume the full upload bandwidth, and only then fail
    /// with a Cloudinary error — worse than rejecting it immediately with a
    /// clear reason. Raise this only after raising the Cloudinary plan (or
    /// moving PRIMARY_FILE storage elsewhere).
    MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().max(512).default(10),

    STORAGE_DRIVER: z.enum(['local', 'cloudinary', 'gcs']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('.storage'),
    STORAGE_SIGNING_SECRET: z.string().min(16),
    STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    /// Folder prefixes, not buckets — Cloudinary organises by folder. The port
    /// calls these "bucket" so the same vocabulary covers GCS/S3 later.
    STORAGE_PRIVATE_BUCKET: z.string().default('jsmf/private'),
    STORAGE_PUBLIC_BUCKET: z.string().default('jsmf/public'),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    /// Real GCS bucket names, deliberately *not* reusing STORAGE_*_BUCKET.
    ///
    /// Those two are Cloudinary folder prefixes (`jsmf/private`), and every
    /// Cloudinary object already stored records one of them in its `bucket`
    /// column. The Cloudinary adapter decides whether an object is private by
    /// comparing that column against the current STORAGE_PRIVATE_BUCKET — so
    /// repointing those variables at GCS bucket names would make every
    /// already-sold PDF look public to the adapter still serving it. Separate
    /// variables keep the old objects readable exactly as they were.
    GCS_PRIVATE_BUCKET: z.string().optional(),
    GCS_PUBLIC_BUCKET: z.string().optional(),
    /// Optional: inferred from Application Default Credentials when unset,
    /// which is the normal case on Cloud Run.
    GCS_PROJECT_ID: z.string().optional(),

    /// V1 runs without Redis on purpose — it is a paid service that nothing in
    /// V1 needs, and leaving it out is a deliberate cost decision rather than an
    /// oversight. What it would be used for (rate-limit state, caches, job
    /// queues) is written so that turning it on is this flag plus a URL.
    ///
    /// Turn it on when any of these becomes true:
    ///   1. More than one API instance runs. Rate-limit counters live in each
    ///      process's memory, so N instances means N times the intended limit
    ///      and a user throttled inconsistently depending on where they land.
    ///   2. The first background job exists (exports, bulk ingest, email).
    ///   3. A read path gets hot enough that Postgres caching is not enough.
    REDIS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    REDIS_URL: z.string().url().optional(),

    /// MAIL_DRIVER=log prints emails to the application log instead of sending
    /// them, so flows that depend on email — admin invitations today, password
    /// reset and receipts later — work end to end before any mail account
    /// exists. Refused in production by the check below.
    MAIL_DRIVER: z.enum(['log', 'smtp', 'resend']).default('log'),
    /// The envelope sender. Must be an address the mail account is allowed to
    /// send as — for Resend, a domain verified in the dashboard — or providers
    /// will reject or spam-folder the message.
    MAIL_FROM: z.string().default('JSMF <no-reply@jsmf.local>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    /// What the mail plan actually allows. No provider reports this — Resend's
    /// API returns only a per-second request rate limit — so the numbers have
    /// to be told to us, and they are what the delivery-count log lines are
    /// measured against. Defaults are Resend's free tier; raise both on upgrade.
    MAIL_DAILY_QUOTA: z.coerce.number().int().positive().default(100),
    MAIL_MONTHLY_QUOTA: z.coerce.number().int().positive().default(3000),

    /// SMS_DRIVER=none is the default and is a valid production setting, unlike
    /// MAIL_DRIVER=log: SMS is genuinely optional. It costs money per message
    /// and, in India, needs a DLT template approved by the regulator before the
    /// first one sends — so a deployment can legitimately run without it.
    ///
    /// What the setting controls is not just the transport but whether buyers
    /// are *offered* a mobile route at all: `SmsService.enabled()` reads this,
    /// and the "your email failed, use your mobile number instead" alternative
    /// appears only when it is on. Turning it on before MSG91 works would offer
    /// a dead end, which is worse than offering nothing.
    SMS_DRIVER: z.enum(['none', 'log', 'msg91']).default('none'),
    /// Assumed when a number is typed without a country code. India today; a
    /// variable rather than a constant so the first market outside it is
    /// configuration rather than a code change.
    SMS_DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,4}$/).default('91'),
    MSG91_AUTH_KEY: z.string().optional(),
    /// The DLT-approved template MSG91 sends. The wording lives with the
    /// regulator, not in this repository — we supply only the blanks, which the
    /// template must name OTP and EXPIRY.
    MSG91_OTP_TEMPLATE_ID: z.string().optional(),
    /// The six-character approved sender header ("JSMFIN"). Optional: MSG91
    /// falls back to the template's own sender when it is absent.
    MSG91_SENDER_ID: z.string().optional(),

    /// WhatsApp over Meta's Cloud API. `none` is valid in production; `log`
    /// prints codes and is refused there, like SMS_DRIVER=log.
    WHATSAPP_DRIVER: z.enum(['none', 'log', 'meta']).default('none'),
    /// A System User token from Meta Business Settings — not a temporary
    /// 24-hour token from the API setup page, which silently expires.
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    /// The *Phone number ID* from WhatsApp → API Setup, not the phone number.
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v23.0'),
    /// An approved AUTHENTICATION-category template with a copy-code button,
    /// whose "code expires in" is set to 15 minutes to match the backend.
    WHATSAPP_OTP_TEMPLATE_NAME: z.string().optional(),
    WHATSAPP_OTP_TEMPLATE_LANGUAGE: z.string().default('en'),
    /// An approved UTILITY-category template for purchase receipts, sent to
    /// buyers who have a verified mobile number and no email. Optional and
    /// separate from the OTP template: Meta prices and approves by category, so
    /// one cannot stand in for the other. Without it, those buyers simply get
    /// no receipt — the purchase itself is unaffected.
    WHATSAPP_RECEIPT_TEMPLATE_NAME: z.string().optional(),
    WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE: z.string().default('en'),

    /// Whether buyers can sign in or sign up with a mobile number at all.
    /// Off by default and independent of the transports: WhatsApp can be fully
    /// configured and tested while the storefront still shows no mobile option.
    /// When on, it needs at least one phone channel (WhatsApp or SMS) to be
    /// configured, or there would be a button that can never send a code.
    PHONE_SIGNIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /// Every phone code costs money, so resends are limited per number as well
    /// as per IP. Tunable here rather than in code.
    PHONE_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(60),
    PHONE_CODE_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),

    /// Base URL of the admin front-end, used to build invitation links that are
    /// emailed to invitees. Not inferred from the request: an invitation link is
    /// built server-side and must not be steerable by a Host header.
    ADMIN_APP_URL: z.string().url().default('http://localhost:3001'),

    /// Base URL of the **buyer-facing storefront** — where a customer's library
    /// lives. Used for the "your files are ready" links in purchase receipts,
    /// by email and by WhatsApp alike.
    ///
    /// Deliberately not `APP_PUBLIC_URL`, which is this *API's* own base URL and
    /// ends in `/api`. Using that produced a receipt link to
    /// `…/api/library` — a page that does not exist — which is what this
    /// variable was added to fix. Deliberately not `ADMIN_APP_URL` either: the
    /// two happen to be one deployment today, and sending buyers to a URL named
    /// after the admin panel would quietly break the day they are not.
    STOREFRONT_URL: z.string().url().default('http://localhost:3001'),

    /// The rate limit a single caller gets per minute — counted against their
    /// account when signed in, and only against their IP address when not.
    ///
    /// Sized for one person rather than one network: a page view costs two or
    /// three API calls, so a student opening a new page every few seconds
    /// produces 40-50 a minute. The default sits well clear of that and far
    /// below anything automated.
    ///
    /// In configuration rather than in code because it is a number to tune
    /// against real traffic, not a decision: the defaults are derived from
    /// estimated usage, and the first weeks of real load are what actually
    /// settle them. Raising it should not cost a rebuild and a redeploy.
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),

    /// The per-IP backstop, counted per minute against the source address even
    /// for signed-in callers.
    ///
    /// Exists because counting per account widens one gap: someone holding
    /// several accounts would otherwise get an allowance for each. This closes
    /// it without reintroducing the shared-network problem, because it is set
    /// where no legitimate network reaches — roughly 100 students browsing hard
    /// behind one NAT is ~2,000/min, while a script manages ten times this
    /// default from a single source.
    ///
    /// A backstop, not a budget: if it trips, something is wrong.
    RATE_LIMIT_IP_CEILING_PER_MINUTE: z.coerce.number().int().positive().default(3_000),

    /// Which addresses are proxies we control, as a comma-separated list of
    /// CIDR ranges or Express presets (`loopback`, `linklocal`, `uniquelocal`).
    ///
    /// Rate limiting counts requests per client IP. Behind a proxy the
    /// connecting address is the proxy's — identical for every visitor — so the
    /// real one is read from `X-Forwarded-For`, whose entries are walked from
    /// the right, skipping addresses listed here, and stopping at the first that
    /// is not. That address is the client.
    ///
    /// A list rather than a hop count, which this replaces, because a count
    /// cannot be correct here: the same deployment is reachable through two
    /// chains of different lengths. Via the custom domain the request crosses
    /// Firebase Hosting and Cloud Run (three entries); via the service's own
    /// `.run.app` URL it crosses only Cloud Run, and whatever the caller put in
    /// the header is preserved. A count right for one is wrong for the other —
    /// and wrong in the dangerous direction for the second, where it would read
    /// an attacker-supplied entry and let anyone mint a fresh identity per
    /// request. Matching on address is correct for both, because it stops at the
    /// first address Google did not write regardless of how many precede it.
    ///
    /// The defaults are the ranges this deployment actually runs behind:
    /// `34.96.0.0/12` is Cloud Run's front end, `66.249.64.0/19` is Firebase
    /// Hosting's edge, `35.191.0.0/16` and `130.211.0.0/22` are Google's load
    /// balancers, and the three presets cover the local and container networks
    /// that stand in for a proxy in development.
    ///
    /// Empty trusts nothing, which is correct for a process reached directly.
    TRUST_PROXY_RANGES: z
      .string()
      .default(
        'loopback,linklocal,uniquelocal,34.96.0.0/12,35.191.0.0/16,130.211.0.0/22,66.249.64.0/19',
      )
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),

    /// Buyer signup with an email and a password, alongside Google sign-in.
    ///
    /// On: buyers may choose either. It was briefly off, when V1 was Google-only
    /// to hold email volume down — a password account normally needs a
    /// verification mail to prove the address and a reset mail when the password
    /// is forgotten, and on a plan allowing 100 sends a day those two flows
    /// would have been most of the volume.
    ///
    /// Neither is sent today, which is why turning this back on costs no email
    /// at all: `register` creates the account and starts the session directly,
    /// so a signup cannot be blocked or failed by the mail quota. The absence of
    /// a reset mail has a real consequence, though — **there is no
    /// forgot-password flow**, so a buyer who forgets their password cannot
    /// recover the account without an admin. Building that flow is what should
    /// bring the first of those two emails back.
    ///
    /// Admin accounts are unaffected either way: they are created by invitation
    /// and set a password through that flow, which this flag does not gate.
    PASSWORD_SIGNUP_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    /// Google sign-in. Off until credentials exist, so the platform runs
    /// without a Google Cloud project — the same pattern as every other
    /// external dependency here.
    GOOGLE_OAUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    GOOGLE_CLIENT_ID: z
      .string()
      .transform((v) => v.trim())
      .optional(),
    GOOGLE_CLIENT_SECRET: z
      .string()
      .transform((v) => v.trim())
      .optional(),
    /// Must match a redirect URI registered in the Google Cloud console exactly.
    GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:4000/api/auth/google/callback'),
    /// Signs the OAuth `state` parameter, which must survive a round trip
    /// through Google and come back unmodified. Its own secret rather than
    /// reusing STORAGE_SIGNING_SECRET: one key per purpose means compromising
    /// download-link signing cannot be turned into forging sign-in state.
    OAUTH_STATE_SECRET: z.string().min(16),

    /// Front-ends permitted to receive a completed sign-in.
    ///
    /// Identity is platform-wide: the PYQ app (3000), the PDF platform (3001)
    /// and later the mobile apps all use this one flow, so the destination
    /// cannot be a single hardcoded URL. It is an allowlist rather than a free
    /// parameter because an unvalidated redirect target is the classic OAuth
    /// open-redirect hole — an attacker would simply ask for the session to be
    /// delivered to a site they control.
    OAUTH_ALLOWED_REDIRECTS: z
      .string()
      .default('http://localhost:3000/auth/callback,http://localhost:3001/auth/callback')
      .transform((value) =>
        value
          .split(',')
          .map((uri) => uri.trim())
          .filter(Boolean),
      ),

    PAYMENT_DRIVER: z.enum(['stub', 'razorpay']).default('stub'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STUB_PAYMENT_SECRET: z.string().min(16).optional(),

    /**
     * The sweep that catches payments the webhook never told us about. On by
     * default: off means a capture whose webhook was never delivered is never
     * noticed, which is money taken for something the buyer never receives.
     * Turn it off only where something else runs it — a dedicated worker, or
     * one nominated instance of several.
     */
    PAYMENT_RECONCILIATION_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /** How long after checkout a payment with no outcome is worth querying. */
    PAYMENT_RECONCILIATION_STALE_AFTER_MINUTES: z.coerce.number().int().positive().default(10),
    /** Past this, an unpaid checkout is assumed abandoned and stops being polled. */
    PAYMENT_RECONCILIATION_GIVE_UP_AFTER_HOURS: z.coerce.number().int().positive().default(72),
    PAYMENT_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(50),

    /**
     * Where the sweep's clock lives. `cron` is an in-process timer, which needs
     * a process to exist — true under Docker Compose, false on Cloud Run with
     * `min-instances=0`, where the timer has nothing to fire in and CPU is
     * frozen between requests. `http` moves the schedule to Cloud Scheduler,
     * which arrives as a request and so wakes the container it needs. The
     * endpoint itself carries no secret of its own — Cloud Run's IAM policy is
     * the authentication, the same way it already is for every `/api/*` call
     * the frontend makes (see `pdf-web/src/middleware.ts`).
     */
    PAYMENT_RECONCILIATION_TRIGGER: z.enum(['cron', 'http']).default('cron'),

    SEED_ADMIN_EMAIL: z.string().email().default('admin@jsmf.local'),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
    SEED_ADMIN_NAME: z.string().default('JSMF Admin'),
  })
  // Credentials are only demanded of the driver actually selected, so the whole
  // system runs on stubs until real accounts exist — but the moment a driver is
  // switched on, its configuration is mandatory rather than silently absent.
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'gcs') {
      for (const key of ['GCS_PRIVATE_BUCKET', 'GCS_PUBLIC_BUCKET'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=gcs`,
          });
        }
      }

      if (
        env.GCS_PRIVATE_BUCKET &&
        env.GCS_PRIVATE_BUCKET === env.GCS_PUBLIC_BUCKET
      ) {
        // The separation *is* the access control: the private bucket is the one
        // with no public access to grant. One bucket serving both would mean a
        // purchased PDF and a cover image are equally reachable, and the only
        // thing standing between a buyer and every file would be nobody
        // guessing a URL.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GCS_PUBLIC_BUCKET'],
          message:
            'GCS_PUBLIC_BUCKET must differ from GCS_PRIVATE_BUCKET — visibility is enforced by ' +
            'bucket, so sharing one would make purchased files publicly readable',
        });
      }
    }

    if (env.STORAGE_DRIVER === 'cloudinary') {
      for (const key of [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=cloudinary`,
          });
        }
      }
    }

    if (env.RATE_LIMIT_IP_CEILING_PER_MINUTE < env.RATE_LIMIT_PER_MINUTE) {
      // Inverted, the ceiling stops being a backstop and becomes the real
      // limit — reintroducing exactly the shared-network problem that counting
      // per account was meant to remove, and silently, because both limits
      // still appear to work.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMIT_IP_CEILING_PER_MINUTE'],
        message:
          `RATE_LIMIT_IP_CEILING_PER_MINUTE (${env.RATE_LIMIT_IP_CEILING_PER_MINUTE}) must be at ` +
          `least RATE_LIMIT_PER_MINUTE (${env.RATE_LIMIT_PER_MINUTE}) — a ceiling below the ` +
          'per-caller limit would bite first, putting every user on a shared network back into one allowance',
      });
    }

    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when MAIL_DRIVER=resend',
      });
    }

    if (env.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MAIL_DRIVER=smtp`,
          });
        }
      }
    }

    if (env.SMS_DRIVER === 'msg91') {
      for (const key of ['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SMS_DRIVER=msg91`,
          });
        }
      }
    }

    if (env.WHATSAPP_DRIVER === 'meta') {
      for (const key of [
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_OTP_TEMPLATE_NAME',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when WHATSAPP_DRIVER=meta`,
          });
        }
      }
    }

    if (env.PHONE_SIGNIN_ENABLED && env.WHATSAPP_DRIVER === 'none' && env.SMS_DRIVER === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PHONE_SIGNIN_ENABLED'],
        message:
          'PHONE_SIGNIN_ENABLED=true needs WHATSAPP_DRIVER or SMS_DRIVER to be configured — ' +
          'otherwise the storefront offers mobile sign-in that can never send a code',
      });
    }

    if (env.GOOGLE_OAUTH_ENABLED) {
      for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when GOOGLE_OAUTH_ENABLED=true`,
          });
        }
      }
    }

    if (env.REDIS_ENABLED && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when REDIS_ENABLED=true',
      });
    }

    if (env.PAYMENT_DRIVER === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        const value = env[key];

        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_DRIVER=razorpay`,
          });
          continue;
        }

        // Presence is not enough. A placeholder left in `.env` passes every
        // check the application makes and then fails silently at the one moment
        // that matters: every webhook Razorpay sends is rejected as unsigned,
        // so any buyer who closes the tab after paying gets nothing, and the
        // only symptom is a warning in a log nobody is reading. Refusing to
        // boot turns a lost payment into an obvious startup failure.
        if (PLACEHOLDER_SECRET.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} still looks like a placeholder ("${value.slice(0, 16)}…"). Copy the real value from the Razorpay dashboard — a wrong webhook secret silently rejects every payment notification.`,
          });
        }
      }
    }

    if (env.PAYMENT_DRIVER === 'stub' && !env.STUB_PAYMENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STUB_PAYMENT_SECRET'],
        message: 'STUB_PAYMENT_SECRET is required when PAYMENT_DRIVER=stub',
      });
    }

    if (env.NODE_ENV === 'production') {
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
      if (env.MAIL_DRIVER === 'log') {
        // An admin approval code printed to a log file instead of delivered is
        // both a broken flow and a credential sitting in plaintext logs.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAIL_DRIVER'],
          message:
            'MAIL_DRIVER=log only writes emails to the application log and must not be used in production',
        });
      }
      if (env.SMS_DRIVER === 'log') {
        // Note this refuses `log` but allows `none`. A one-time code printed to
        // a log file is a live credential in plaintext, which is a security
        // problem; running without SMS at all is merely a product decision.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMS_DRIVER'],
          message:
            'SMS_DRIVER=log writes one-time codes to the application log and must not be used in ' +
            'production — use msg91, or none to disable SMS entirely',
        });
      }
      if (env.WHATSAPP_DRIVER === 'log') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WHATSAPP_DRIVER'],
          message:
            'WHATSAPP_DRIVER=log writes one-time codes to the application log and must not be ' +
            'used in production — use meta, or none',
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
