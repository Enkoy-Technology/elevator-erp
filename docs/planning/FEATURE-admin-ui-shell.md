# Implementation Plan: Admin UI Shell (Next.js)

## Task
Stand up the Next.js 15 admin dashboard (TAD client layer) with a login flow
wired to the real `/v1/auth` API and a dashboard shell ready to host the
module screens as backend phases land.

## Context
- Backend Phase 0 is done: `/v1/auth/login|refresh|logout|me` on port 3002.
- TAD §1.3: Admin frontend = Next.js 15 + React + TypeScript, Tailwind,
  shadcn/ui-style components. Public portal (SvelteKit) comes with Module 6.
- Ports 3000/3001 are used by other local projects → web dev server on 3003.
- The web app lives in `web/` with its own lockfile and its own
  `pnpm-workspace.yaml` so it stays isolated from the API workspace root.

## Requirements
- [ ] API: CORS enabled for the web origin (env-driven, default localhost:3003).
- [ ] `web/`: Next.js 15 App Router + TypeScript strict + Tailwind v4.
- [ ] Login page: tenant slug + email + password → stores JWT pair.
- [ ] API client with automatic refresh-token rotation on 401, redirect to
      /login when refresh fails.
- [ ] Dashboard shell: sidebar with the 9 TAD modules (locked until their
      phase ships), topbar with user info + logout, profile card from /auth/me.
- [ ] Branding defaults from the seeded tenant palette (navy #1B2A4A,
      gold #E8B54D); per-tenant theming later with Module 1 branding API.

## Open Questions
- Token storage: localStorage for now (simple, works offline-first). Move to
  httpOnly cookies + BFF pattern when we harden security pre-production.
- shadcn/ui component generator deferred until data-heavy CRM screens; the
  shell uses hand-rolled Tailwind components with the same look.

## Files to Modify
- `src/config/env.schema.ts`, `src/main.ts`, `.env.example` — CORS origin
- `web/**` — new Next.js app
- `README.md`, `AGENTS.md` — web commands

## Verification
- [ ] `pnpm run build` (web) passes; API typecheck/lint/test stay green
- [ ] Browser: login with demo creds → dashboard renders profile from API
- [ ] Wrong password shows the RFC 7807 detail; logout returns to /login

## Risks
- CORS misconfig blocks the browser → keep origin list env-driven.
- Port collisions on this machine → web pinned to 3003.
