# JSMF

JSMF is a medical exam preparation platform focused on Memory-Based / Recall-Based Previous Year Questions (PYQs) for NEET-PG, FMGE, and INI-CET. See [`docs/`](./docs/README.md) for the full product vision, V1 scope, architecture direction, content-pipeline philosophy, UI/UX plan, and roadmap.

## Repository layout

This repository is organized as a small monorepo so that the web app, backend, and mobile app can each live in their own folder as they're built, without needing to be split into separate repositories:

```
JSMF/
  docs/     Product, architecture, and planning documentation (start here)
  web/      Next.js + TypeScript web application (marketing site + logged-in app)
  backend/  (not yet created) NestJS + TypeScript API — planned per docs/03-architecture.md
  mobile/   (not yet created) Flutter app for Android + iOS — planned per docs/03-architecture.md
```

## Current stage

The project is currently in the **mock UI / product discovery stage**: [`web/`](./web) is a frontend-only Next.js prototype using static, mocked sample data. There is no real backend, database, authentication, or payment integration yet — see [`docs/02-v1-scope.md`](./docs/02-v1-scope.md) for the precise distinction between this prototype stage and the real V1 release, and [`docs/06-roadmap.md`](./docs/06-roadmap.md) for the stages that follow.

## Getting started (web app)

```bash
cd web
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).
