# Implementation Plan: Admin Web Shell (Next.js)

## Task
Ship a runnable Next.js 15 admin console that signs into the Phase 0 API and
shows a dashboard shell with the delivery roadmap.

## Context
- API runs on `http://localhost:3002/v1` with JWT auth + CORS for `:3003`.
- TAD §1.3: Frontend (Admin) = Next.js + React + TypeScript + Tailwind.
- Module screens stay locked until their backend phases ship; this is the shell.

## Requirements
- [ ] Next.js 15 app in `web/` on port 3003
- [ ] Login against `POST /v1/auth/login` (tenant slug + email + password)
- [ ] Persist access/refresh tokens; refresh on 401; logout clears tokens
- [ ] Authenticated dashboard showing profile + API health + module roadmap
- [ ] Sidebar navigation with phase badges for unshipped modules
- [ ] CORS already enabled on the API for `http://localhost:3003`

## Proposed Approach
Isolated `web/` package (own lockfile) so Next.js installs do not disturb the
API workspace. Client-side auth for Phase 0 simplicity; httpOnly cookies can
land when MFA / hardened auth ships.

## Files
- `web/` — Next.js app (login, dashboard, API client, sidebar)
- `docs/planning/FEATURE-admin-web-shell.md` — this plan
- Root `README.md` / `AGENTS.md` — how to run the UI

## Verification
- [ ] `pnpm --dir web typecheck` / `pnpm --dir web build` green
- [ ] Login with demo credentials reaches the dashboard
- [ ] Sign-out returns to `/login`

## Risks
- Browser CORS misconfig → fix via `CORS_ORIGINS` on the API `.env`
- Token storage in localStorage is XSS-sensitive; acceptable for Phase 0 shell
