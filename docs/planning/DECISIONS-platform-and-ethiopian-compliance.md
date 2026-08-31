# Platform & Ethiopian compliance — decisions and research

**Written 2026-08-07.** Output of a research session on two questions: should the ERP be rebuilt on an
open-source platform, and what does Ethiopian law actually require of it. Nothing in this document has
been implemented — it is the assessment, not a changelog.

Facts here were verified against primary sources (statutory text, the `version-16` ERPNext branch,
GitHub APIs) rather than marketing pages. Where something could not be verified it is marked
**UNVERIFIED** and must not be built against.

---

## 1. Platform: stay on NestJS

Evaluated ERPNext/Frappe, Odoo, Axelor, Metasfresh and iDempiere as a base for a customisable Ethiopian
ERP. **Decision: keep the existing NestJS + Drizzle + Postgres-RLS stack.**

### Why not ERPNext

- **No row-level security.** Isolation is SQL fragments the ORM appends to queries. `frappe.db.get_all`
  skipping user permissions is documented by the Frappe team as *"the intended behavior"*, and a core
  developer states that anyone able to run code on a site can read everything on it. Four
  permission-bypass fixes landed in a two-month window in 2026.
- **Multi-company is an accounting feature, not a tenant boundary.** `Customer.json` and `Item.json` on
  `version-16` have no `company` field at all. Frappe's founder answers "separate customers per
  company?" with *"Setup separate instances."* A company-restriction feature is slated for v17 and its
  own commit message documents its bypass.
- **Site-per-tenant is therefore the real model, and all sites on a bench share one app version.** You
  can never pilot an upgrade with a single customer. `bench update` writes `maintenance_mode: 1` for
  every site at once, then aborts the whole run on the first failed patch.
- **Ethiopian localisation is one line** — `VAT 15.0` in `country_wise_tax.json`. 73 charts of accounts,
  none for Ethiopia or East Africa. No Ethiopian calendar and no framework concept of an alternate
  calendar system to hook into.
- **Release stability.** A four-year production customer, counting his own tickets: *"50% of what we
  have reported recently are cases of new release breaking what was previously working."* Bug reports
  up ~74% in the v16 year; accounting bugs open ~3 years.
- **Licensing splits by delivery model.** Frappe is MIT and ERPNext GPLv3, so SaaS hosting triggers no
  disclosure — but shipping an on-prem LAN install to a client *is* distribution, which switches GPLv3
  on for custom apps. Several sibling apps (`print_designer`, CRM, Helpdesk, Insights) are AGPL-3.0 and
  trigger §13 over the network. `print_designer` in particular gets installed almost reflexively.
- Odoo Community gates Payroll, Studio and mobile behind Enterprise, priced €19.90–29.90/user with no
  emerging-market tier. iDempiere has zero GitHub releases.

### Why the current code is not the lock-in

Of roughly 12,000 lines, only ~700 are genuinely irreplaceable (the elevator calculator and
`recurrence.ts`). `calc-math.ts` imports nothing but `decimal.js` and its own types, so it ports
anywhere. **The DB-enforced tenant isolation is the asset**, and it is the one thing a migration would
destroy. The honest comparison is not "ERPNext vs. build everything" — it is *ERPNext + Ethiopian
localisation from scratch + the elevator domain from scratch + a Python/Frappe ramp + their upgrade
risk* versus *this system + a finance module*.

### Treat "customisable" as a design requirement here

Per-tenant custom fields and configuration inside this codebase. Switching frameworks does not make
that decision for you, and client #2 must not become a forked branch.

---

## 2. Do not build an Amharic UI

Counterintuitive but well-evidenced. The MoR eTax portal is English-only with no language switcher.
IFRS — which Ethiopia mandates — is an English regime. Ethiopian accountant job ads demand English and
Peachtree, never Amharic software. Nobody has done it: ERPNext and Frappe ship 38 locales with **no
Amharic file at all** (`grep Amharic` across `frappe/frappe` returns 0 hits), and Odoo's `am.po` is
0.83% complete and abandoned since 2022. For scale, Frappe + ERPNext have 16,325 translatable strings
and *French* is ~52% done after a decade.

Also: since February 2020 Ethiopia has five federal working languages and Oromo has more L1 speakers
than Amharic, so "Amharic = localised for Ethiopia" is not even accurate.

**What is required instead — Amharic-safe data.** Ethiopic homophones are distinct Unicode codepoints
(ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ, አ/ዐ), so a name typed one way and searched another returns zero results with no error
explaining why. Normalise on write and on query (`amharic-normalizer` on npm), embed Noto Sans Ethiopic
for PDF output, and print Amharic on customer-facing documents. Roughly a week, versus a permanent
translation burden.

---

## 3. Ethiopian law — in force vs. announced

### In force, verified, binding

| Item | Detail |
|---|---|
| **Personal Data Protection Proclamation No. 1321/2024** | In force 24 July 2024. **Art 22(1): personal data collected in Ethiopia must be stored on a server or data centre located in Ethiopia.** Art 22(2) allows the regulator to designate "critical personal data" processable only in-country. Arts 18–21 gate cross-border transfer. Regulator: Ethiopian Communications Authority (named at Art 2(36)). Penalties to 4% of worldwide turnover, plus 5–10 years criminal for illegal transfer. |
| **VAT Proclamation No. 1341/2024** | 15%. Registration threshold ETB 2,000,000 over 12 months. Monthly returns. Art 52 requires an original tax invoice at the time of every taxable supply. **ETB 50,000 penalty per invoice issued otherwise than as provided.** Simplified invoices are a retailer carve-out — a B2B contractor gets no relief. |
| **PAYE** | Six monthly bands: 0–2,000 exempt · 2,001–4,000 15% · 4,001–7,000 20% · 7,001–10,000 25% · 10,001–14,000 30% · >14,000 35%. **The old 10% band is gone.** |
| **Pension** | 7% employee / 11% employer on **basic salary, not gross**. Mandatory for Ethiopian citizens, 30-day remittance. |
| **Domestic withholding** | 3% — goods ≥ ETB 20,000, services ≥ ETB 10,000. **30% where the supplier cannot produce TIN + licence.** |
| **CIT** | 30%. Quarterly advances at 25% of prior-year liability. Tax year 8 July – 7 July; annual return ~7 November. |
| **Accounting standard** | AABE mandates IFRS for SMEs. **No prescribed national chart of accounts exists** — the COA is a product decision, not a compliance one. |
| **NBE FXD/04/2026** (12 Feb 2026) | Banks may issue Visa/Mastercard to all FX account holders. Recurring USD charges are now legally possible — but only for a business already holding foreign currency. |

### Issued but not a deadline

**Directive No. 1142/2026** (dated ~2 July 2026). Clearance-model e-invoicing: transmit to the
Ministry's registry, receive an IRN + QR, and only then is the document valid. Licenses software
providers directly. Offline fallback with manual QR invoices reconciled within 72 hours.

**But there is no commencement date, no implementation schedule, no phase plan, no accredited-vendor
list, no technical annexes, no API spec and no sandbox.** Taxpayer obligations are deferred to a
schedule the Authority has not published anywhere reachable. Every claim in circulation traces to two
law-firm marketing posts and one press summary — nobody has read the directive. **Do not build against
it.**

### Explicitly UNVERIFIED — do not build against these

- Whether the existing sales register machine (ETR) regime is repealed, replaced, or coexists with
  software accreditation. No source addresses it, and the first provider category is still literally
  "sales registration system suppliers", which reads as continuity.
- **Whether an ERP clearing through an already-accredited third party needs its own licence.** This
  single unknown decides whether accreditation and bonds touch you at all.
- Bond amounts (a USD 10k–250k range is reported; the currency is itself suspect, since an Ethiopian
  directive would denominate in ETB).
- A Tier III in-Ethiopia data-centre requirement for SaaS providers (single-sourced).
- VAT Regulation 570/2025 and its reported universal EFD mandate (single-sourced, low-grade aggregator).
- The claim that manual invoices lost validity in January 2026 (headline only).
- **The proclamation number of the 2025 income tax amendment.** Do not print a proclamation number on a
  payslip or tax report.

---

## 4. The invoicing module is a parallel book

**Your invoices cannot be the legal tax document today, and you cannot establish otherwise from
anything public.** What operates in Ethiopia as of August 2026 is the ETR regime with nightly
Z-reports. No cohort has been confirmed to have crossed over.

Design accordingly: the customer issues the legal document on their ETR; the ERP records that
document's identifiers against its own invoice. That is re-keying, and it is also what every Ethiopian
business does today. Pretending otherwise ships a product that exposes the customer to ETB 50,000 per
invoice.

The pitch is not "we issue your invoices". It is: the ERP owns contracts, AR, aging, withholding
computation, revenue recognition and VAT return *preparation*. The fiscal document is an attachment.

**The hedge, which costs almost nothing:**

```
invoice_no             -- yours, internal, NEVER the legal number
fiscal_doc_number      -- nullable
fiscal_device_serial   -- nullable
irn / rrn / qr_payload -- nullable
fiscal_status          -- NONE | MANUAL | PENDING | CLEARED | FAILED
```

Five nullable columns and one enum. Identical whether the identifier comes off an ETR keypad today or
from MoR clearance in 2028. **Do not** build a clearance client, a retry state machine, or an
accreditation-ready audit subsystem — there is no spec and no date.

---

## 5. Is the market real? — unproven

State this honestly rather than optimistically.

- ~**30,600 federal VAT registrants** in the entire country. That is the ceiling of the
  clearance-mandated market, not the addressable market.
- **Zero published ETB price points for any business software in Ethiopia.** The single number the
  decision most needs does not exist publicly.
- **Frappe Cloud is USD 5–40/month with free software.** That is the price floor for generic ERP
  functionality — the moat cannot be "has modules".
- **No ERPNext partner in Ethiopia**, while Kenya, Tanzania, Egypt, Uganda, Nigeria and South Africa
  each have one. Either an unserved gap or a market that never paid enough to sustain a channel; the
  two are indistinguishable from here, and the pessimistic reading costs a year.
- Birr at ~161.71/USD, down 16% y/y. This prices Odoo out of reach (genuinely an advantage) but inflates
  foreign hosting costs in ETB every year.
- Nobody has counted Ethiopian elevator/electromechanical contractors. That is the actual TAM and it is
  unknown.

**Blunt version: one paying customer is not a market.** Horizontal "customisable ERP for Ethiopian
businesses" against free ERPNext is lost on distribution, not on code. What is defensible is vertical
depth — maintenance SLA by breakdown severity, landed cost on imported lift components, technician
scheduling around outages — plus ETB billing on local rails. Get two or three more
elevator/electromechanical customers paying in ETB before generalising.

---

## 6. Codebase state as of 2026-08-07

**Tables (10):** `tenants`, `tenantBranding`, `users`, `customers`, `projects`, `assets`,
`maintenanceContracts`, `serviceVisits`, `breakdowns`, `notifications`.

**Modules:** assets, auth, customers, dashboard, elevator-calc, employees, maintenance, notifications,
projects, settings.

Observations relevant to the finance build:

- **No finance tables at all.** No quotation, proforma, invoice, payment or ledger. The finance module
  is greenfield, not an extension.
- **`customers.outstandingBalanceEtb` is a live defect.** It is rendered in the customer list
  (`web/src/app/customers/page.tsx:251`) but nothing in the application ever writes it — the only
  assignment anywhere is `'0'` in a test fixture. Every customer therefore shows a permanently stale
  balance presented as real. `creditLimitEtb` likewise has no enforcement behind it. Either hide the
  column until invoicing exists or derive it; the choice depends on the finance design, so it was left
  alone rather than guessed at.
- **The money path is currently clean.** ETB columns are Postgres `numeric` with explicit precision, and
  the dashboard aggregates in SQL (`dashboard.repository.ts:185,207`) rather than pulling values into
  JavaScript. `decimal.js` is used only by the elevator calculator. **When invoicing lands this
  discipline must hold** — any arithmetic moving into JS needs `decimal.js`, or the schema's precision is
  discarded at the service layer.
- **`employees` is a projection over `users`**, not its own table. Correct; keep it that way.
- **No inventory module**, despite `CLAUDE.md` specifying inventory as an immutable ledger with
  reversing entries. That convention currently describes something that does not exist.

---

## 7. Build order — next 6 months, one developer

Effort in dev-weeks. Items 1–8 are unblocked; none waits on a document not yet in hand.

| # | Item | Effort | Notes |
|---|---|---|---|
| 1 | **Exports** | 1–2w | List endpoints already return `{items,…}`. Add `?format=csv` and stream. PDF only for documents handed to a person. No `ExportService` abstraction. |
| 2 | **SMS channel** | 1–2w | Extend the existing notification dispatcher; do not create an SMS module. **Start the sender-ID paperwork in week 1** — the lead time is the critical path, not the code. Amharic = 70 chars/segment. |
| 3 | **Effective-dated rate tables + fiscal calendar** | 1w | `(kind, valid_from, valid_to, payload jsonb)`. Every posted document stores the rate version that priced it. Fiscal year configurable per tenant, default 8 July. **Do this before any finance code** — it is unwindable afterwards. |
| 4 | **AR / invoicing (internal book)** | 3–4w | Invoice, line, credit note, payment allocation, aging. Decimal money. VAT and WHT from the rate table. Supplier TIN/licence-on-file flag driving 3% vs 30%. The five fiscal columns from §4. |
| 5 | **GL** | 4–6w | Double-entry, append-only, reversing entries. Own COA template rolling up to IFRS-for-SMEs statement lines. Trial balance, P&L, BS, period close. Audit log belongs here, not as a retrofit. |
| 6 | **Payroll** | 3–4w | Six PAYE bands from the rate table. Pension 7/11 on **basic** — a different base from PAYE. Typed allowance lines with configurable exempt caps. One generic "statutory other deduction" row. No proclamation numbers on payslips. |
| 7 | **Outage hardening** | 1–2w | `synchronous_commit=on` for money writes, idempotency keys on every mutating endpoint, one outbox table for external delivery. The outbox serves SMS now and any future clearance queue for free. |
| 8 | **Landed cost on imported components** | 1–2w | Duty + VAT + 10% surtax + 3% social welfare levy + 3% advance income tax, all configurable. **The 3% advance posts to a receivable offsetting annual CIT, not to expense** — the generic packages get this wrong. This is the vertical wedge. |
| 9 | **Hosting migration to Ethiopia** | 1–2w work | Months of procurement lead time. Start Raxio / Wingu / Telecloud conversations in month 1. Art 22 is live law and this is the only legal exposure closable this year. |

**Explicitly NOT in six months:** clearance integration, accreditation, bond, VAT e-filing. No spec, no
date, and no answer on whether accreditation even applies.

---

## 8. Get from an official source before building finance

Ordered by leverage.

1. **Email Risit (risit.et)** and any other claimant. Ask: (a) are you accredited under Directive
   1142/2026, with what reference number; (b) do you expose a partner/reseller/white-label API; (c) can
   we see the integration spec under NDA; (d) what does it cost per tenant or per invoice. **This one
   email resolves the build-vs-partner fork and probably the accreditation question.** One hour, gates a
   year of roadmap.
2. **The customer's document drawer.** Photograph every document they legally issue today — ETR receipt,
   VAT invoice, withholding receipt, a supplier invoice they received. One afternoon, and it describes
   the real regime better than any law-firm blog.
3. **MoR, Tax Information and Cash Registration Machine Administration Directorate.** In writing: the
   official Directive 1142/2026 *including both technical annexes*; the Art 29 implementation schedule;
   the accredited-supplier list; and — *does an accredited software system remove the obligation to
   issue through a certified sales register machine, or do both apply?* and *does an ERP transmitting
   through an already-accredited provider require its own accreditation?*
4. **Federal Negarit Gazeta** (HoPR library / Berhanena Selam). Hard copies of VAT Proclamation
   1341/2024 (read the commencement article), the 2025 Income Tax (Amendment) Proclamation (**get its
   number and gazette date**), and VAT Regulation 570/2025 if it exists.
5. **A local tax practitioner, 2–3 paid hours.** The PAYE bands being withheld *this month*;
   per-diem/transport/medical exempt caps and the directive setting them; the cost-sharing rate; VAT
   return due day; PAYE and WHT remittance due days; whether Turnover Tax still applies below ETB 2m.
   These are the numbers that make payroll wrong and none are in any source consulted.
6. **ECA.** Is the Art 33 controller/processor register open? Has the Art 33(3) registration directive
   been issued? In writing: **does Art 22 permit an Ethiopian primary with an offshore backup replica?**
   Until answered, keep backups in-country.
7. **Ethio Telecom / Afromessage / GeezSMS.** Sender-ID registration form, per-SMS price in ETB, Amharic
   Unicode segment pricing.

---

## 9. Design constraints the research forces

- **No tax rate is a constant.** Four changed inside 24 months and a PAYE band was deleted. Effective-dated
  rows; every posted document records the rate version that produced it. Otherwise a prior period cannot
  be restated or explained to an auditor.
- **The internal invoice number is never the legal document number.** Two fields, forever.
- **PAYE base ≠ pension base.** Allowances, overtime and bonuses are in the first and out of the second.
  Never fold an allowance into basic salary.
- **Fiscal year is configurable per tenant.** 8 July is a default, not a constant — MoR approves
  alternative periods.
- **Financial ledgers are append-only.** Reversing entries only, the same rule already stated for
  inventory. Also a prerequisite for any future certification.
- **Art 22 means Ethiopian hosting, not on-premise.** An Ethiopian-hosted multi-tenant SaaS satisfies it.
  Do not retreat to per-customer installs — market pull is toward *in Ethiopia*, not *on my server*, and
  single-tenant installs destroy the only economics that make one developer viable.
- **39 power outages a month means writes must be durable at commit.** Do not relax `synchronous_commit`
  for throughput on money paths. Idempotency keys so a power cut mid-submit cannot produce two invoices.
  This is the one place laziness is wrong.
- **Never put a remote call on a user's save path.** Outbox plus worker — SMS today, clearance later.
  Legacy MoR infrastructure runs bare HTTP on non-standard ports; assume flaky, set aggressive timeouts.
- **10-year retrievability per tenant, including after churn.** No hard deletes; export/escrow clause in
  the SaaS terms. Until someone confirms electronic-only records satisfy the Commercial Code, do not sell
  "go paperless" as a compliance benefit — exports must reproduce a printable original.
- **Price in ETB, bill through an Ethiopian entity, collect by local transfer or telebirr, invoice
  annually.** You carry the FX exposure. Do not build a USD card subscription: the Feb 2026 card rule
  presupposes the customer holds foreign currency, and an ETB-only SME does not.
- **English UI, Amharic-safe data and search.** The finance module must not break this — Amharic customer
  names must be searchable and must render in exported PDFs.

---

## 10. Infrastructure baseline (Addis Ababa)

- **Power is the real constraint:** ~39 outages and ~21 hours of downtime per month (Energy for Growth
  Hub, Dec 2025), against a good-practice standard of 10–15 interruptions *per year*. 49% of Ethiopian
  firms own or share a generator. Commercial tariffs rise 4–6× by 2028 under IMF-driven reform.
- **Connectivity is better than expected:** median fixed download ~9.4 Mbps; entry fibre ~ETB 998/month;
  100 GB mobile for ETB 849 (~$0.06/GB). 4G reaches 82% of the population.
- **Shutdowns are regional, not national.** ~30 since 2016 (most in Africa), but every one was either
  regional (Tigray, Amhara, Oromia) or a nationwide *platform* block. No documented full blackout of
  Addis Ababa in 2023–2026, and Ethiopia dropped out of Top10VPN's shutdown-cost tables for 2024 and
  2025.

Architect around the power grid and the single Djibouti transit corridor, not around political
shutdowns.

---

## 11. Other open items

**Elevator calculator — needs a product decision, not a code fix.** It returns identical car and shaft
dimensions for every capacity (320 kg and 5,000 kg both yield 1100×1400) because the
`max(1100, 0.6·√Q + 200)` floors always win. Deliberately not guessed at — a product owner must decide
the intended behaviour.

**Before production** (see also the prod-deploy memory): real `app_user` password, a random 32+ char
`JWT_SECRET`, `TRUST_PROXY_HOPS` set when behind a proxy, Redis-backed throttler if scaling out.

**Marketing site** (`../shining-star-site`, separate project) is blocked on client input: vector logo, an
email address, one agreed set of statistics (the profile says 142 completed on p26 and ~128 on p34, and
claims 8 years' experience while stating a May 2023 founding), WhatsApp number confirmation, partner
logos, and permission to publish client names.

---

## Sources

Primary where possible: Ethiopian Federal Negarit Gazeta proclamations as cited; the ERPNext and Frappe
`version-16` branches and GitHub APIs; Frappe's own forum and documentation; World Bank WDI and
Enterprise Surveys; DataReportal/Kepios; Freedom House FOTN 2025; Top10VPN; Energy for Growth Hub.
Claims resting on secondary sources are marked as such in §3.
