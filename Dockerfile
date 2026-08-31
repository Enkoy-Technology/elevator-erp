# Production image for the API. Built on a machine with internet, carried
# to the client's Addis Ababa LAN server as a `docker save` tarball — see
# docs/ops/deploy-runbook.md. Two stages: `build` compiles TypeScript and
# is discarded; `runtime` is everything that actually ships.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Puppeteer's own Chromium download needs internet the target box may not
# have, and would just duplicate the distro Chromium the runtime stage
# installs below (see that stage for the full reasoning) — skip it in every
# stage, not only runtime, so a build-stage `pnpm install` never attempts it.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# bcrypt (a native addon) falls back to compiling from source when no
# prebuilt binary matches this exact node/libc combination — a C++
# toolchain only the build stage needs; it never reaches the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Pin the same pnpm version this repo develops against (package.json has no
# `packageManager` field to drive `corepack enable` automatically).
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# devDependencies (typescript, @nestjs/cli, ...) already did their job.
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Chromium decision (task-1 brief §1.1): install the distro package rather
# than let `puppeteer` download its own pinned build. Reasons:
#  1. No internet on the target box — the distro package is pulled at BUILD
#     time on a machine that has it; the target box only ever `docker load`s
#     a finished image.
#  2. Puppeteer's bundled Chromium needs ~15 shared libraries a slim base
#     doesn't ship; hand-listing them is exactly what apt already does for
#     free as the chromium package's own dependencies.
#  3. Security patches ride Debian's normal apt update cadence instead of a
#     Chromium build frozen at whatever puppeteer@25.3.0 happened to pin.
# fonts-liberation: the invoice/quotation templates' font stack (layout.ts)
# is `Arial, Helvetica, 'Noto Sans Ethiopic', sans-serif` — Arial/Helvetica
# don't exist on Linux, so without a real Latin fallback here, ordinary
# English/number text (not just Amharic) renders as tofu on a base image
# that ships no fonts at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3002 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# The vendored Noto Sans Ethiopic .ttf files (src/common/export/fonts/) are
# never read at runtime — document-pdf.service.ts's font-face CSS embeds
# them as base64 data URIs baked into noto-sans-ethiopic.data.ts, which
# `nest build` compiles straight into dist/ like any other source file. No
# separate COPY step needed; the smoke test below proves it survives.

# Non-root: a real home directory (not `--no-create-home`) so Chromium has
# somewhere to write its user-data-dir/cache instead of failing on a
# missing $HOME.
RUN groupadd --gid 1001 nodeapp \
    && useradd --uid 1001 --gid nodeapp --create-home --shell /usr/sbin/nologin nodeapp

COPY --from=build --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=build --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /app/package.json ./package.json

# The migration .sql files, at the path migrate.ts already asks for
# (`migrationsFolder: 'src/database/migrations'`) — hence a `src/` directory
# in a runtime image, which otherwise looks like a mistake. `nest build`
# emits dist/database/migrate.js but copies no non-TypeScript assets, so
# without this the compiled migrator is present and has nothing to run.
#
# This is what lets migrations run from THIS image:
#   docker compose run --rm --entrypoint node api dist/database/migrate.js
# rather than from a separate container mounting a node_modules tree built
# on the operator's laptop — which fails outright when that laptop is a Mac
# and this container is Linux, because tsx/esbuild ship per-platform native
# binaries. Same reason bootstrap-tenant and seed-rates run from here.
COPY --from=build --chown=nodeapp:nodeapp /app/src/database/migrations ./src/database/migrations

USER nodeapp
EXPOSE 3002

# No curl/wget on a slim image — a one-line Node request avoids adding
# either just for this. Hits the same /v1/health app.controller.ts serves.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||3002)+'/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
