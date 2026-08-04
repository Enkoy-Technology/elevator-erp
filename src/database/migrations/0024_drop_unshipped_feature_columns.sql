-- Columns for features that were never built (MFA, email/phone verification,
-- notification preferences, PDF letterheads, Stripe billing, plan quotas).
-- No code reads or writes any of them; re-add alongside the feature that
-- actually needs them.
ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS phone_verified_at,
  DROP COLUMN IF EXISTS mfa_enabled,
  DROP COLUMN IF EXISTS mfa_totp_secret,
  DROP COLUMN IF EXISTS notification_preferences;--> statement-breakpoint
ALTER TABLE tenant_branding
  DROP COLUMN IF EXISTS letterhead_url,
  DROP COLUMN IF EXISTS seal_url,
  DROP COLUMN IF EXISTS bank_details,
  DROP COLUMN IF EXISTS pdf_header_html,
  DROP COLUMN IF EXISTS pdf_footer_html;--> statement-breakpoint
ALTER TABLE tenants
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS max_users,
  DROP COLUMN IF EXISTS max_projects,
  DROP COLUMN IF EXISTS storage_quota_mb;
