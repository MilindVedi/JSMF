# Observability: logs, crash reports and alerts

How JSMF finds out something is wrong — in its own servers, in a student's
browser, or on a phone — and who gets told. Platform-wide: the API and every
app use what is described here.

Three parts, each independent of the others:

| Part | What it gives you | Where it lives |
| :--- | :--- | :--- |
| **1. Request correlation** | Every backend log line of one API call shares a `requestId` and its Cloud Trace, so "what happened in this request" is one query | `backend/src/shared/logging/`, `backend/src/common/middleware/request-context.ts` |
| **2. Crash reports** | Errors in the websites and the phone app reach the logs (they used to vanish in the user's browser) | `POST /api/client-errors` (`backend/src/modules/client-errors/`), `@jsmf/core/observability`, each app's `error.tsx` / `instrumentation*.ts` |
| **3. Alerts** | An email when something breaks, instead of finding out from a student | `scripts/gcp/setup-monitoring.ps1` + `scripts/gcp/monitoring/` |

There is no third-party service (no Sentry, no agent, no SDK). Cloud Run
already ships every process's stdout/stderr to **Cloud Logging**; **Error
Reporting** reads from there and groups errors into issues; **Cloud
Monitoring** alerts on both. Everything below is configuration and log shape.

---

## 1. Request correlation

Each request gets an id the moment it arrives — `requestContext` is the first
middleware — and every log line written while serving it carries:

| Field | Value |
| :--- | :--- |
| `requestId` | A fresh UUID, also returned as the `X-Request-Id` response header |
| `logging.googleapis.com/trace` (+ `spanId`, `trace_sampled`) | The Cloud Trace from Cloud Run's `traceparent` / `X-Cloud-Trace-Context` header |
| `userId` | The signed-in user, once authentication has run |
| `method`, `path` | The request (path only — query strings carry codes and tokens) |

**Finding a request:** in Logs Explorer, open any line and click its trace —
Cloud Run's own request entry and every app line of that request appear
together. Or query `jsonPayload.requestId="<id>"` (a user or a screenshot of a
failed call can give you the `X-Request-Id`).

Why the request id is **never taken from the caller**: anyone can send an
`X-Request-Id`, and one an outsider chose could be made to collide with
someone else's request. The trace id *is* read from headers (it is what links
our lines to Cloud Run's request log); it is validated to its exact format and
used for grouping only, so a forged one can only misfile the forger's own lines.

The trace needs the project id. On Cloud Run it is read once at boot from the
metadata server; locally it is absent and lines simply carry no trace.
`GOOGLE_CLOUD_PROJECT` overrides.

**Server errors as Error Reporting events.** Any ERROR/CRITICAL line with a
stack trace (unhandled exceptions, `ExceptionsHandler`) is written with the
`@type`/`serviceContext` Error Reporting needs, the stack in `message`. Error
Reporting then groups repeats into one issue per cause. The process also logs
one CRITICAL line on a crash (`uncaughtExceptionMonitor` — observes only; Node
still exits and Cloud Run restarts the instance, as before).

> Field rename: the Nest logger name used to be written as `context`; it is now
> `logger`, because Error Reporting reserves `context` for an object.

---

## 2. Crash reports from the apps

### What is caught

| App | Browser / JS errors nothing caught | A page or screen that crashed while rendering | Server-side rendering errors |
| :--- | :--- | :--- | :--- |
| `web/` (PYQ) | `src/instrumentation-client.ts` | `app/error.tsx`, `app/global-error.tsx` | `src/instrumentation.ts` (`onRequestError`) |
| `main-web/` | same files | same files | same file |
| `pdf-web/` (store + admin) | same files | same files | same file |
| `mobile/` | `ErrorUtils` global handler (+ Hermes rejection tracker in release builds), installed from `mobile/index.js` before any app module loads | each screen's error screen (`unstable_screenErrorBoundary`) and the root `ErrorBoundary` in `app/_layout.tsx`; a screen that crashes on its first render is reported under its own route | — |

On the phone, reports still waiting in the 2-second batch are sent when the app
goes to the background (iOS pauses timers there, and the OS may end the app).

The error screens show a **Reference** (Next.js's `digest`). For an error
during server rendering the same digest is on the server's `next.request_error`
line, so a student's screenshot is enough to find it:
`jsonPayload.digest="<reference>"`.

### What is sent, and what never is

Each report: app, platform (`web`/`ios`/`android`), release, kind
(`error`, `unhandledrejection`, `render`, `chunk`, `fatal`), error name,
message, stack, the page's **pathname**, Next's digest, a repeat count.

Never: query strings, request headers, cookies, tokens, form contents, emails,
phone or card numbers. Redaction runs **twice** — on the device before sending
(`redactSecrets` in `@jsmf/core/observability`) and again on the server
(`backend/src/shared/logging/redact.ts`), which is the copy that counts since a
client can be modified. A test (`redact-parity.spec.ts`) fails if any client
copy stops matching the server.

### Noise the apps drop before sending

Errors from browser extensions, scripts an app's in-app browser injects
(Instagram/Facebook's `iabjs://`), `ResizeObserver loop`, cross-origin
`Script error.`, `AbortError`, the user's network dropping ("Failed to
fetch"), and the API answering 4xx (the screens handle those; 5xx are kept).
Each page load sends at most 20 distinct errors; a repeat is counted, not
re-sent. Automated browsers (`navigator.webdriver`) send nothing.

### The endpoint: `POST /api/client-errors`

Public (a crash can happen before sign-in — the sign-in page breaking is the
one that matters most). Answers **204** to everything it accepts, valid or
not — the only other answers are **429** (throttled) and **400** for a body
sent as `application/json` that is not JSON at all (Express rejects it before
the route runs, as for the analytics intake; no app sends one). What keeps a
public write endpoint safe:

- **Writes only to the log**, never to the database.
- Body capped at 24 KB before parsing; at most 5 errors per request; every
  field type-checked and length-capped (message 1000 chars, stack 50 lines /
  8000 chars, page 300); multi-line messages flattened so they cannot fake
  extra log lines; control characters stripped.
- **Nothing the sender chooses decides where an entry is filed.** The Error
  Reporting service name is built from a closed list: `jsmf-<app>-<platform>`
  (`jsmf-pyq-web`, `jsmf-main-web`, `jsmf-store-web`, `jsmf-pyq-android`,
  `jsmf-pyq-ios`).
- Bots and empty user agents dropped.
- **Per caller:** `CLIENT_ERRORS_RATE_LIMIT_PER_MINUTE` (default 30), plus the
  global per-address ceiling.
- **Everyone together:** `CLIENT_ERRORS_MAX_PER_MINUTE` per API instance
  (default 600). Past it, reports are dropped and one `client.errors_dropped`
  warning is written per minute — which has its own alert. This is the cost
  ceiling under a flood from many addresses.
- **Kill switch:** `CLIENT_ERRORS_ENABLED=false` — still 204, logs nothing, no
  app redeploy needed. Each app also has a build-time switch:
  `NEXT_PUBLIC_CLIENT_ERRORS_ENABLED=false` (websites),
  `EXPO_PUBLIC_CLIENT_ERRORS_ENABLED=false` (phone).

Each accepted error becomes one ERROR line, `jsonPayload.activity="client.error"`,
shaped as an Error Reporting event. Logs are readable only by members of the
Google Cloud project.

### Releases

Set `NEXT_PUBLIC_APP_RELEASE` at build time (e.g. the commit SHA in Cloud
Build) so Error Reporting can say which release first saw an issue. Unset, it
reports `unknown`. The phone app reports its `app.json` version.

---

## 3. Alerts

All alerting is code in `scripts/gcp/monitoring/`, applied by one script:

```powershell
./scripts/gcp/setup-monitoring.ps1 -ProjectId <project> -AlertEmail <you@jsmf.me> -DryRun   # see what it would do
./scripts/gcp/setup-monitoring.ps1 -ProjectId <project> -AlertEmail <you@jsmf.me>
```

Safe to re-run: everything is matched by name and updated in place. It only
creates or updates — it never deletes. Needs Monitoring Editor and Logs
Configuration Writer.

| Alert | Fires when | Notify at most |
| :--- | :--- | :--- |
| **JSMF - server error** | Any ERROR+ line from `jsmf-backend`, `jsmf-web-main`, `jsmf-pdf-web`, `jsmf-web-pyqs` (crash reports excluded — they have their own) | every 5 min |
| **JSMF - payments: checkout cannot start** | `checkout.provider_error` — nobody can pay | every 5 min |
| **JSMF - payments: webhook failed** | `webhook.failed` — a payment may not be settling | every 5 min |
| **JSMF - app crashes spiking** | More than 20 crash reports from one app in 10 min (`-ClientErrorThreshold`) | while above |
| **JSMF - crash-report intake flooded** | `client.errors_dropped` — the intake hit its ceiling | hourly |

One step is manual: **Error Reporting → Configure notifications** → pick the
same email channel. That emails you the first time a *new* kind of error
appears, which is the most useful single alert there is.

Each alert's email carries a short runbook (its `documentation` field).

### Queries worth saving

```
# Every line of one request
jsonPayload.requestId="<X-Request-Id>"

# All crash reports, newest first, for one app
jsonPayload.activity="client.error"
jsonPayload.serviceContext.service="jsmf-pyq-web"

# A student's error screen "Reference"
jsonPayload.digest="<reference>"

# Website server-rendering errors
jsonPayload.activity="next.request_error"
```

---

## Settings

| Variable | Where | Default | Meaning |
| :--- | :--- | :--- | :--- |
| `CLIENT_ERRORS_ENABLED` | backend | `true` | Accept crash reports |
| `CLIENT_ERRORS_RATE_LIMIT_PER_MINUTE` | backend | `30` | Reports per caller per minute |
| `CLIENT_ERRORS_MAX_PER_MINUTE` | backend | `600` | Reports one API instance logs per minute, all callers together |
| `GOOGLE_CLOUD_PROJECT` | backend | *(metadata server)* | Only for writing traces; leave unset on Cloud Run |
| `NEXT_PUBLIC_CLIENT_ERRORS_ENABLED` | web, main-web, pdf-web (build time) | on | Send crash reports |
| `NEXT_PUBLIC_APP_RELEASE` | web, main-web, pdf-web (build time) | unset | Release name in reports |
| `EXPO_PUBLIC_CLIENT_ERRORS_ENABLED` | mobile (build time) | on | Send crash reports |

## Not done yet (deliberately)

- **Retention.** Cloud Logging keeps logs 30 days by default. Long-term audit
  (payments) would be a log sink to Cloud Storage or BigQuery — a cost
  decision, not a code change.
- **Source maps.** Website stacks point at minified chunks. Uploading source
  maps to a private bucket and resolving them is a later step.
- **Fatal crashes on the phone.** Reported best-effort as the app goes down; a
  native crash (outside JS) is not caught at all. A native crash reporter is
  the follow-up if store builds show unexplained exits.
- **A general log redaction filter** for the server's own lines. Today the
  server's lines rely on call sites never logging secrets (see
  `shared/logging/activity.ts`); the redactor is applied to client-sent text only.
