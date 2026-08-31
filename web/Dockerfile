# Production image for the admin UI. Build context is web/ (its own
# isolated pnpm workspace — see web/pnpm-workspace.yaml). Carried to the
# client's Addis Ababa LAN server the same way as the API image: built
# elsewhere, `docker save`d, `docker load`ed — see docs/ops/deploy-runbook.md.

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
