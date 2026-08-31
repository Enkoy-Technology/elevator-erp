-- Custom SQL migration file, put your code below! --

-- Fix-wave-c #4: InvoicesRepository.agingReport's own doc comment claims
-- "a null dueDate here means the customer had no resolvable terms" — true
-- only for invoices written AFTER the R4 fix started defaulting dueDate
-- from the customer's paymentTermsDays at issue time (see resolveDueDate's
-- own doc comment). Every invoice written BEFORE that fix has a null
-- dueDate for the mundane reason that the caller simply omitted it, and
-- those rows report as `current` in the aging buckets regardless of age —
-- genuinely overdue historical AR silently disappears. Backfills every such
-- row the exact same way resolveDueDate computes it at issue time:
-- issuedAt's calendar date + the customer's paymentTermsDays. Verified
-- against the live dev DB, which has rows in exactly this state.
update invoices
set due_date = issued_at::date + c.payment_terms_days::int
from customers c
where c.tenant_id = invoices.tenant_id
  and c.id = invoices.customer_id
  and invoices.due_date is null;
