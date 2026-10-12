# JSMF Web

The Next.js + TypeScript web application for JSMF — the public marketing site and the logged-in PYQ practice application. This is currently a **frontend-only mock UI prototype**: all data (questions, subjects, users, sessions, statistics) is static/mocked, and there is no real backend, database, authentication, or payment integration behind it yet.

See the repository root [`README.md`](../README.md) and [`docs/`](../docs/README.md) for full product and architecture context, and [`docs/05-ui-ux-plan.md`](../docs/05-ui-ux-plan.md) specifically for the design and frontend architecture this app implements.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui (Radix primitives) + lucide-react icons
- Zustand for client-side mock state (practice sessions, bookmarks, auth, subscription)
- react-hook-form + zod for forms
- recharts for the statistics dashboard

## Getting started

`web/` is an npm workspace (with [`packages/core`](../packages/core), the `@jsmf/core` code it shares with the mobile app), so dependencies install from the repo root into the root `node_modules`, from the single root `package-lock.json`:

```bash
# from the repo root
npm install
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint the codebase
