# Production image for the admin UI. Build context is web/ (its own
# isolated pnpm workspace — see web/pnpm-workspace.yaml). Carried to the
# client's Addis Ababa LAN server the same way as the API image: built
# elsewhere, `docker save`d, `docker load`ed — see docs/ops/deploy-runbook.md.

# --- Cloud Run (free public demo) — ADDITIVE ---------------------------------
# The LAN/on-prem path above is unchanged and is still the real deployment.
# Nothing below alters how this image builds; it only records the order the
# build ARG forces on you. Every step here was verified against this image.
#
# NEXT_PUBLIC_API_URL is a BUILD input, but on Cloud Run the API's URL does
# not exist until the API is deployed. Hence a strict, unavoidable ordering:
#
#   1. Deploy the API first — its URL does not exist before this.
#        gcloud run deploy erp-api --region "$R" --memory 1Gi ...
#      (1GiB is measured, not guessed: three concurrent PDF renders need it.)
#
#   2. Capture that URL.
#        API_URL="$(gcloud run services describe erp-api --region "$R" \
#                     --format='value(status.url)')"
#
#   3. Build THIS image with it, then deploy. --platform linux/amd64 is not
#      optional: a build on an Apple Silicon Mac defaults to arm64 and Cloud
#      Run refuses it ("Container manifest type must support amd64/linux").
#        docker build --platform linux/amd64 \
#          --build-arg NEXT_PUBLIC_API_URL="$API_URL/v1" -t "$IMG" .
#        docker push "$IMG"
#        gcloud run deploy erp-web --image "$IMG" --region "$R"
#
#   4. Only now does the web URL exist. Feed it back to the API's CORS_ORIGINS
#      or every browser call dies at the preflight.
#
# Re-run 3-4 whenever the API URL changes. A REBUILD IS THE ONLY WAY to
# repoint the UI: the URL is baked into the client bundle *and* into the CSP's
# connect-src in .next/routes-manifest.json (next.config.ts). No runtime env
# var can move it, which is exactly why this stays a build ARG.
#
# PORT: Cloud Run injects it, and the injected value overrides the ENV default
# in the runtime stage below (verified: PORT=8080 -> binds 0.0.0.0:8080), so
# there is nothing to configure and no --port flag to remember.

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_API_URL is compiled into the bundle (and the CSP's
# connect-src — see next.config.ts) at BUILD time, not read at container
# startup. A build made without it silently ships pointed at
# localhost:3002, and every API call then fails in the browser with nothing
# but a console error — this has bitten the project once already
# (docs/ops/deploy-runbook.md §4). Fail the build loudly instead.
ARG NEXT_PUBLIC_API_URL
RUN if [ -z "$NEXT_PUBLIC_API_URL" ]; then \
      echo "ERROR: --build-arg NEXT_PUBLIC_API_URL is required (e.g. http://192.168.1.10:3002/v1) — refusing to build a UI that would silently point at localhost:3002." >&2; \
      exit 1; \
    fi
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Switches on the "demonstration system, fictional data" banner. Like
# NEXT_PUBLIC_API_URL above it is inlined at BUILD time, so setting it only on
# the running container does nothing — without this ARG the free public demo
# would ship with no banner at all, and the one thing keeping that deployment
# lawful under Proclamation 1321/2024 Art 22 is that it SAYS it holds
# fictional data.
#
# Unset is the on-prem default, and `isDemoMode` accepts only the exact
# string '1', so the production build cannot opt in by accident.
ARG NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE

RUN pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3003 \
    HOSTNAME=0.0.0.0

RUN groupadd --gid 1001 nextjs \
    && useradd --uid 1001 --gid nextjs --create-home --shell /usr/sbin/nologin nextjs

# `output: 'standalone'` (next.config.ts) traces only the node_modules the
# server actually needs — smaller and simpler than copying the workspace's
# full node_modules and pruning by hand.
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3003

# No curl/wget on a slim image — a one-line Node request avoids adding
# either just for this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||3003)+'/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
