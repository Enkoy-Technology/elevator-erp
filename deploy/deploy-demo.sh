#!/usr/bin/env bash
#
# deploy-demo.sh — the FREE PUBLIC DEMO path: Cloud Run (api + web) + Neon.
#
# ⚠ LEGAL, before anything else. Ethiopian Personal Data Protection
# Proclamation 1321/2024 Art 22(1) requires personal data collected in
# Ethiopia to be stored on a server IN Ethiopia. Cloud Run and Neon are both
# abroad. Everything this script builds is therefore lawful ONLY while the
# database holds invented data: fictional customers, fictional employees,
# fictional phone numbers. No real records, ever, not even "just to try it".
#
# The real client deployment is docker-compose.prod.yml + Caddyfile on a
# server in Ethiopia — see "Deploying the compose bundle" in
# docs/ops/deploy-runbook.md. Nothing here replaces it.
#
# Usage:
#   GCP_PROJECT=my-project \
#   NEON_ADMIN_URL='postgresql://neondb_owner:PW@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require' \
#     deploy/deploy-demo.sh
#
# Run it again to update: every step is create-or-update, so a second run
# ships new images and leaves the URLs, the secrets and the seeded data alone.
#
# Full walkthrough, free-tier limits and teardown: docs/ops/deploy-runbook.md,
# section "Free public demo — Cloud Run + Neon (NOT the production path)".

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

require_env() {
  [ -n "${!1:-}" ] || die "$1 is not set. $2"
}

# ---------------------------------------------------------------------------
# 0. Inputs. Nothing is guessed: a missing value stops the run and names
#    itself. Secrets are never defaulted — the ones that must be strong get
#    generated below instead of asking a human to invent them.
# ---------------------------------------------------------------------------

require_env GCP_PROJECT \
  "The Google Cloud project id that will own the demo (gcloud projects list)."
require_env NEON_ADMIN_URL \
  "Neon's DIRECT connection string for the project owner — the host WITHOUT '-pooler'. Migrations do DDL and CREATE ROLE, which Neon's pooled endpoint rejects."

# Not secrets, so defaults are fine. No Google region is in Ethiopia; pick the
# one nearest your Neon region to keep the per-query round trip short.
REGION="${REGION:-europe-west1}"
AR_REPO="${AR_REPO:-elevator-erp}"
API_SERVICE="${API_SERVICE:-erp-demo-api}"
WEB_SERVICE="${WEB_SERVICE:-erp-demo-web}"

command -v gcloud  >/dev/null || die "gcloud is not on PATH — https://cloud.google.com/sdk/docs/install"
command -v docker  >/dev/null || die "docker is not on PATH."
command -v openssl >/dev/null || die "openssl is not on PATH (it generates the secrets)."
docker info >/dev/null 2>&1   || die "The Docker daemon is not running."
gcloud auth print-access-token >/dev/null 2>&1 \
  || die "Not signed in to gcloud. Run: gcloud auth login"

gc() { gcloud --project="$GCP_PROJECT" "$@"; }

# The demo banner is the entire legal defence of this deployment, and it is a
# BUILD-time constant (web/src/components/demo-mode.ts). Docker silently
# ignores a --build-arg with no matching ARG, which would ship a public demo
# carrying no Art 22 warning at all. Refuse in one second rather than after a
# five-minute build.
grep -q 'NEXT_PUBLIC_DEMO_MODE' "$ROOT/web/Dockerfile" || die \
"web/Dockerfile does not declare NEXT_PUBLIC_DEMO_MODE, so the demo banner
       would be silently omitted and this deployment would carry no Art 22
       warning. Add these two lines to its build stage, beside the existing
       NEXT_PUBLIC_API_URL pair, then re-run:

           ARG NEXT_PUBLIC_DEMO_MODE
           ENV NEXT_PUBLIC_DEMO_MODE=\$NEXT_PUBLIC_DEMO_MODE"

# Neon hands out two hostnames for one database and they are not
# interchangeable. The direct endpoint is a real session — migrations, DDL,
# CREATE ROLE. The pooled one is PgBouncer, which is what the app needs: on
# Cloud Run the app is N instances x a 20-connection pool and would otherwise
# exhaust a free-tier Neon compute in a single spike. Derive the pooled host
# by Neon's documented convention ('-pooler' before the first dot) and print
# it so you can compare it with the console. Set POOLED_HOST if they disagree.
case "$NEON_ADMIN_URL" in
  *sslmode=*) ;;
  *) die "NEON_ADMIN_URL has no sslmode — append '?sslmode=require'. The app's connection strings are derived from it, and none of them may travel unencrypted." ;;
esac
neon_tail="${NEON_ADMIN_URL#*@}"
direct_host="${neon_tail%%/*}"
db_and_query="${neon_tail#*/}"
case "$direct_host" in
  *-pooler.*) die "NEON_ADMIN_URL points at Neon's POOLED endpoint ('$direct_host'). Migrations need the direct one — the same hostname with '-pooler' removed." ;;
  *.*) ;;
  *) die "NEON_ADMIN_URL does not look like a Neon connection string (host: '$direct_host')." ;;
esac
POOLED_HOST="${POOLED_HOST:-${direct_host%%.*}-pooler.${direct_host#*.}}"

IMAGE_TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$ROOT" diff --quiet HEAD || IMAGE_TAG="$IMAGE_TAG-dirty"
REGISTRY="$REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPO"
API_IMAGE="$REGISTRY/api:$IMAGE_TAG"
WEB_IMAGE="$REGISTRY/web:$IMAGE_TAG"

SA_NAME="erp-demo-run"
SA_EMAIL="$SA_NAME@$GCP_PROJECT.iam.gserviceaccount.com"

JWT_SECRET_NAME="erp-demo-jwt-secret"
DB_URL_SECRET_NAME="erp-demo-database-url"
OUTBOX_URL_SECRET_NAME="erp-demo-outbox-database-url"

say "Demo deployment plan"
note "project     $GCP_PROJECT"
note "region      $REGION   (no Google region is in Ethiopia — see the Art 22 note at the top)"
note "database    $direct_host   (migrations)"
note "            $POOLED_HOST   (the running app)"
note "images      $API_IMAGE"
note "            $WEB_IMAGE"
note "services    $API_SERVICE, $WEB_SERVICE"
note ""
note "This is billable: Artifact Registry storage, Cloud Run requests, and the"
note "bandwidth to push two images. Free-tier limits and how to tear the whole"
note "thing down again are in docs/ops/deploy-runbook.md."

# ---------------------------------------------------------------------------
# 1. Project setup. Every step is guarded, so a second run changes nothing.
# ---------------------------------------------------------------------------

say "Enabling the APIs this needs (Cloud Run, Artifact Registry, Secret Manager, IAM)"
note "Already-enabled APIs are left alone. First time, this takes a minute."
gc services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com

say "Artifact Registry repository '$AR_REPO'"
if gc artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  note "already exists — reusing it."
else
  note "creating it. Stored images are billable beyond the free 0.5 GB."
  gc artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location="$REGION" \
    --description="Elevator ERP — free public demo images (fictional data only)"
fi
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

# A dedicated runtime identity. Cloud Run otherwise defaults to the Compute
# Engine service account, which carries project Editor — a world-readable demo
# must not run as that. This one gets exactly three secret reads, nothing else.
say "Runtime service account '$SA_EMAIL'"
if gc iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  note "already exists — reusing it."
else
  gc iam service-accounts create "$SA_NAME" \
    --display-name="Elevator ERP demo (Cloud Run runtime)"
fi

# ---------------------------------------------------------------------------
# 2. Secrets. Generated here rather than invented by a human, kept in Secret
#    Manager (not --set-env-vars, which any project viewer can read straight
#    off the service description), and printed exactly once — on the run that
#    creates them.
# ---------------------------------------------------------------------------

GENERATED_NOTES=""

grant_access() {
  gc secrets add-iam-policy-binding "$1" \
    --member="serviceAccount:$SA_EMAIL" \
    --role=roles/secretmanager.secretAccessor >/dev/null
}

add_version() { printf '%s' "$2" | gc secrets versions add "$1" --data-file=- >/dev/null; }

read_secret() { gc secrets versions access latest --secret="$1" 2>/dev/null || true; }

ensure_secret() {
  if gc secrets describe "$1" >/dev/null 2>&1; then
    return 0
  fi
  gc secrets create "$1" --replication-policy=automatic \
    --labels=app=elevator-erp,env=demo >/dev/null
}

say "Secrets"

ensure_secret "$JWT_SECRET_NAME"
JWT_SECRET="$(read_secret "$JWT_SECRET_NAME")"
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET="$(openssl rand -base64 48)"
  add_version "$JWT_SECRET_NAME" "$JWT_SECRET"
  GENERATED_NOTES="$GENERATED_NOTES
  JWT signing secret                $JWT_SECRET"
  note "$JWT_SECRET_NAME: generated."
else
  note "$JWT_SECRET_NAME: reusing it (a new one would sign every live session out)."
fi
grant_access "$JWT_SECRET_NAME"

# The two application roles. Migrations 0001 and 0049 create app_user and
# outbox_dispatcher with the literal passwords 'app_password' and
# 'dispatcher_password' — both published in this repository, and a Neon
# endpoint answers the whole internet. demo-bootstrap.cli.ts rotates each role
# to whatever password its connection string carries, and refuses to run on
# those committed defaults, so generating a strong one HERE is the thing that
# makes this database not open to everybody. Hex keeps them safe to embed in a
# URL with no escaping.
#
# Sets ROLE_URL rather than echoing: a $( ) subshell would lose the additions
# to GENERATED_NOTES, and echoing a connection string invites logging one.
ROLE_URL=""
ensure_role_url() {
  local secret="$1" role="$2" label="$3" existing pw url
  ensure_secret "$secret"
  existing="$(read_secret "$secret")"
  if [ -n "$existing" ]; then
    pw="${existing#*://}"; pw="${pw%%@*}"; pw="${pw#*:}"
  else
    pw="$(openssl rand -hex 24)"
    GENERATED_NOTES="$GENERATED_NOTES
  Postgres role $(printf '%-20s' "$role")$pw"
  fi
  url="postgresql://$role:$pw@$POOLED_HOST/$db_and_query"
  if [ "$existing" = "$url" ]; then
    note "$secret: unchanged ($label)."
  elif [ -n "$existing" ]; then
    note "$secret: new version — the database host moved ($label)."
    add_version "$secret" "$url"
  else
    note "$secret: generated ($label)."
    add_version "$secret" "$url"
  fi
  grant_access "$secret"
  ROLE_URL="$url"
}

ensure_role_url "$DB_URL_SECRET_NAME" app_user "the running API, under RLS"
DATABASE_URL="$ROLE_URL"
ensure_role_url "$OUTBOX_URL_SECRET_NAME" outbox_dispatcher "the outbox dispatcher"
OUTBOX_DISPATCHER_DATABASE_URL="$ROLE_URL"

if [ -n "$GENERATED_NOTES" ]; then
  cat <<EOF

  ---------------------------------------------------------------------
  NEW SECRETS — shown once, now. They are stored in Secret Manager, so
  this is a convenience rather than the only copy; read one back later
  with: gcloud secrets versions access latest --secret=<name>
$GENERATED_NOTES
  ---------------------------------------------------------------------
EOF
fi

# ---------------------------------------------------------------------------
# 3. API image.
# ---------------------------------------------------------------------------

say "Building the API image (linux/amd64 — Cloud Run refuses arm64)"
note "On an Apple Silicon Mac this cross-builds, and is slow the first time."
docker build --platform linux/amd64 -t "$API_IMAGE" "$ROOT"

say "Pushing $API_IMAGE"
note "Roughly 1 GB the first time; it consumes Artifact Registry storage."
docker push "$API_IMAGE"

# ---------------------------------------------------------------------------
# 4. Migrate + seed — its own explicit step, never a side effect of the API
#    booting. Cloud Run runs many instances against one database; migrations
#    on startup would have them racing each other.
# ---------------------------------------------------------------------------

say "Migrating and seeding — THIS WRITES TO THE DATABASE AT $direct_host"
note "Applies migrations, rotates the two role passwords to the generated ones,"
note "then seeds the statutory rates and the fictional 'Demo Elevators PLC'"
note "tenant. Idempotent: re-running is how you repair a half-finished run."
note ""
note "FICTIONAL DATA ONLY — this server is not in Ethiopia (Art 22(1))."

# An env file, not -e flags: connection strings carry passwords, and -e puts
# them in this machine's process list for anyone who runs `ps`.
BOOTSTRAP_ENV="$(mktemp "${TMPDIR:-/tmp}/erp-demo-bootstrap.XXXXXX")"
chmod 600 "$BOOTSTRAP_ENV"
trap 'rm -f "$BOOTSTRAP_ENV"' EXIT
cat >"$BOOTSTRAP_ENV" <<EOF
ALLOW_DEMO_SEED=1
DATABASE_ADMIN_URL=$NEON_ADMIN_URL
DATABASE_URL=$DATABASE_URL
OUTBOX_DISPATCHER_DATABASE_URL=$OUTBOX_DISPATCHER_DATABASE_URL
EOF

# dist/database/demo-bootstrap.cli.js — `nest build` keeps the '.cli' in the
# filename. It prints the demo accounts and their shared password itself, so
# do not swallow its output.
docker run --rm --platform linux/amd64 --env-file "$BOOTSTRAP_ENV" \
  "$API_IMAGE" node dist/database/demo-bootstrap.cli.js

rm -f "$BOOTSTRAP_ENV"
trap - EXIT

# ---------------------------------------------------------------------------
# 5. Deploy the API. Its URL does not exist until this succeeds, and the web
#    build needs that URL — which is what fixes the order of everything below.
# ---------------------------------------------------------------------------

api_flags=(
  --image="$API_IMAGE"
  --region="$REGION"
  --platform=managed
  --allow-unauthenticated
  --service-account="$SA_EMAIL"
  --port=3002

  # 1 GiB is MEASURED, not guessed: in this image on Linux, one heavy PDF
  # render alongside ~180 MB of app ballast fits in 512 MB, but three
  # concurrent renders need 1 GiB. Do not lower it.
  --memory=1Gi
  --cpu=1

  # gen2 gives a full Linux sandbox. Chromium launches WITH its own sandbox
  # here — document-pdf.service.ts deliberately passes no --no-sandbox and the
  # image runs as non-root — and that needs the user namespaces gen1's gVisor
  # does not provide. The alternative is weakening Chromium's sandbox, which
  # this deployment is not going to do.
  --execution-environment=gen2

  # The 1 GiB figure bounds THREE concurrent PDF renders, not eight arbitrary
  # requests; 8 assumes most traffic is ordinary JSON. Drop to 3 on OOM kills.
  --concurrency=8
  --min-instances=0
  --max-instances=2

  # Cloud Run puts exactly one proxy in front. Left at the default 0, the rate
  # limiter keys every request on Google's frontend IP and the entire demo
  # shares one 200-per-10s bucket. CORS_ORIGINS is set in step 7, once the web
  # service exists and has a URL to point at.
  --set-env-vars=TRUST_PROXY_HOPS=1

  # Secret Manager, not --set-env-vars: env vars are readable by any project
  # viewer off the service description. DATABASE_ADMIN_URL is deliberately
  # absent — the running service has no business holding owner credentials.
  --set-secrets="JWT_SECRET=$JWT_SECRET_NAME:latest,DATABASE_URL=$DB_URL_SECRET_NAME:latest,OUTBOX_DISPATCHER_DATABASE_URL=$OUTBOX_URL_SECRET_NAME:latest"
)

say "Deploying $API_SERVICE (creates it, or adds a revision to it)"
gc run deploy "$API_SERVICE" "${api_flags[@]}"

API_URL="$(gc run services describe "$API_SERVICE" --region="$REGION" --format='value(status.url)')"
[ -n "$API_URL" ] || die "Could not read back the URL of $API_SERVICE."
note "API is at $API_URL"

# ---------------------------------------------------------------------------
# 6. Web image. NEXT_PUBLIC_* values are compiled into the client bundle AND
#    into the CSP's connect-src (web/next.config.ts), so repointing the UI at
#    a different API — or switching the demo banner on — is a rebuild. No
#    runtime env var moves either, which is exactly why the API goes first.
# ---------------------------------------------------------------------------

say "Building the web image against $API_URL/v1, with the demo banner on"
docker build --platform linux/amd64 \
  --build-arg "NEXT_PUBLIC_API_URL=$API_URL/v1" \
  --build-arg NEXT_PUBLIC_DEMO_MODE=1 \
  -t "$WEB_IMAGE" "$ROOT/web"

say "Pushing $WEB_IMAGE"
docker push "$WEB_IMAGE"

say "Deploying $WEB_SERVICE"
gc run deploy "$WEB_SERVICE" \
  --image="$WEB_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --port=3003 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=2

WEB_URL="$(gc run services describe "$WEB_SERVICE" --region="$REGION" --format='value(status.url)')"
[ -n "$WEB_URL" ] || die "Could not read back the URL of $WEB_SERVICE."

# ---------------------------------------------------------------------------
# 7. Close the loop: the API only learns the browser's origin now that the web
#    service exists. Without this, every call dies at the CORS preflight.
#    '^##^' is gcloud's delimiter escape — CORS_ORIGINS is itself a
#    comma-separated list, so the default comma splitting would mangle a
#    two-origin value. --update-env-vars, not --set-env-vars: it must add to
#    TRUST_PROXY_HOPS from step 5, not replace it.
# ---------------------------------------------------------------------------

say "Pointing the API's CORS_ORIGINS at $WEB_URL"
gc run services update "$API_SERVICE" --region="$REGION" \
  --update-env-vars="^##^CORS_ORIGINS=$WEB_URL" >/dev/null

cat <<EOF

=== Demo is up ============================================================

  Give the client this URL:  $WEB_URL
  API health (there is no UI on it — /docs is off in production, by design):
                             $API_URL/v1/health

  Sign in with any of the demo accounts the seed step printed above. The
  login screen lists them too, with a one-click picker.

  FICTIONAL DATA ONLY. Proclamation 1321/2024 Art 22(1) requires personal
  data collected in Ethiopia to be stored on a server in Ethiopia, and this
  one is not. The moment a real customer, employee or supplier is typed in,
  this deployment is unlawful and has to be deleted — not tidied up later.
  The real deployment is the on-prem compose bundle in
  docs/ops/deploy-runbook.md, on a server in Addis.

  Re-run this script to ship a new build. Tear it down when the demo is
  over — "Tearing the demo down" in docs/ops/deploy-runbook.md. Nobody gets
  billed for a demo they deleted.

===========================================================================
EOF
