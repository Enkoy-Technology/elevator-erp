# FEATURE: Settings (branding + EN / አማርኛ)

## Goal
Let the company edit document branding and pick a default UI language (English or Amharic).

## In scope
- Get / update tenant branding (colors, logo URL, address, contact)
- Default locale: `en` | `am`
- Admin Settings page
- Lightweight UI i18n for shell (sidebar) + Settings page

## Out of scope
- File upload for logo (URL field only for now)
- Translating every screen (expand dictionaries later)
- Per-user language override beyond localStorage mirror of tenant default

## API
- `GET /v1/settings`
- `PATCH /v1/settings` — CEO/ADMIN

## UI
`/settings` — branding form + language toggle

## Exit criteria
- [x] Can change primary/secondary colours and contact fields
- [x] Can switch default language to Amharic and see sidebar labels update
