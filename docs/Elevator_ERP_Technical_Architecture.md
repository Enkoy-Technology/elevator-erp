ELEVATOR ERP CLOUD SAAS
PLATFORM
Technical Architecture Document (TAD) &
System Requirements Specification (SRS)
Version 1.0.0
Date July 2026
Classification Internal — Architecture Blueprint
Author Lead Software Architect & Principal Enterprise Systems Engineer
Architecture Style Modular Monolith API with High-Performance Web Client
Scope
This document defines the complete technical architecture for a multi-tenant Cloud SaaS Enterprise
Resource Planning platform designed specifically for Elevator & Electromechanical companies. The
system manages the full lifecycle of elevator projects: marketing, sales lead tracking, dynamic technical
elevator specification calculations, automated quotation and proforma generation, project execution, field
technician installation assignments, custom periodic maintenance schedules, emergency breakdown
dispatch, inventory tracking, and multi-tenant SaaS billing.

TABLE OF CONTENTS
(cid:127) 1. Executive Technical Summary & System Topology
(cid:127) 2. Database ERD Schema Definition
(cid:127) 3. Module-by-Module API Endpoint Specifications
(cid:127) 4. Elevator Calculation & Pricing Mathematical Specification
(cid:127) 5. Multi-Tenant Security & Role-Based Access Control Matrix
(cid:127) 6. Asynchronous Worker & Cron Job Schedule Layout
(cid:127) Appendix A: Data Retention & Compliance
(cid:127) Appendix B: Disaster Recovery
(cid:127) Appendix C: Performance Targets

1. EXECUTIVE TECHNICAL SUMMARY &
SYSTEM TOPOLOGY
1.1 Architecture Philosophy
The platform follows a Modular Monolith architecture pattern — a single deployable unit with clearly
bounded internal modules communicating via well-defined internal APIs. This approach balances the
operational simplicity of monoliths with the maintainability of microservices, providing a pragmatic path for
future service extraction as the platform scales.
Design Principle: Start modular, stay modular, extract when metrics demand it.
1.2 System Topology
The system is organized into four distinct layers: Client Layer, API Gateway, Application Layer, and Data
Layer. External service integrations provide SMS, email, payment processing, mapping, and monitoring
capabilities.
Layer Architecture:
Layer Components Purpose
Next.js Web App (Admin), SvelteKit Public User interfaces for admin dashboard, public
Client
Portal, Mobile PWA ticket reporting, and field engineer mobile access
AWS Application Load Balancer + CloudFront SSL termination, rate limiting, WAF rules, static
API Gateway
CDN asset delivery
NestJS Modular Monolith (9 modules), Socket.io REST APIs, WebSocket real-time, background
Application
Gateway, BullMQ Worker Pool job processing
PostgreSQL (Primary + Read Replica), Redis Relational data with RLS, job queues, object
Data
(Cache + BullMQ), AWS S3 storage for assets and documents
Twilio, SendGrid/SES, Stripe, Google Maps, SMS, email, payments, geolocation,
External
Prometheus/Grafana observability
1.3 Technology Stack Matrix
Layer Technology Version Purpose
Frontend (Admin) Next.js + React + TypeScript 15.x Primary admin dashboard, CRM, analytics
Frontend (Public) SvelteKit + Tailwind CSS 2.x Public ticket portal, QR code reporting
UI Components shadcn/ui + Radix UI Latest Accessible, themeable component primitives

Layer Technology Version Purpose
Modular monolith REST API + WebSocket
Backend API NestJS + TypeScript 11.x
gateway
ORM Drizzle ORM 0.40+ Type-safe SQL, RLS integration
Primary relational database with Row-Level
Database PostgreSQL 16.x
Security
BullMQ job queues, session cache, rate
Cache & Queue Redis 7.x
limiting
Object Storage AWS S3 / Supabase Storage — Tenant assets, signatures, PDFs, photos
Job Queue BullMQ 5.71+ Background job processing, cron scheduling
4.x /
Document Gen @react-pdf/renderer + Puppeteer Server-side PDF compilation
23.x
Real-time Socket.io (NestJS WS Gateway) 4.x Live notifications, presence, tracking
SMS Gateway Twilio Latest Emergency dispatch, payment reminders
Email Service AWS SES / SendGrid — Transactional and marketing emails
Payments Stripe Latest SaaS subscription billing, invoice payments
Maps Google Maps API — Technician dispatch routing, site surveys
Prometheus + Grafana +
Monitoring — Metrics, tracing, alerting
OpenTelemetry
Orchestration Docker + AWS ECS / EKS — Deployment and scaling
1.4 Multi-Tenancy Strategy
The platform implements Shared Database, Shared Schema multi-tenancy with PostgreSQL Row-Level
Security (RLS) as the primary isolation mechanism. This is the recommended default for SaaS platforms at
this scale, providing the best balance of cost efficiency, operational simplicity, and security.
Tenant Isolation Layers:
1. Application Layer: JWT token contains tenant_id claim; middleware validates before any database
operation.
2. Database Layer: PostgreSQL RLS policies enforce tenant_id filtering on every query automatically.
3. Query Layer: Drizzle ORM query builder injects tenant_id via SET_CONFIG before each transaction.
Critical Rule: RLS at the database level is the safety net. Application-layer filtering is the first line of defense.
Never rely on one without the other.
1.5 Deployment Architecture

The deployment runs on AWS within a dedicated VPC (10.0.0.0/16) with public subnets for the ALB, NAT
Gateway, and bastion hosts; private subnets for the application tier (ECS Fargate API and Worker
services) and data tier (RDS PostgreSQL Multi-AZ with read replica, ElastiCache Redis Cluster). AWS S3
provides cross-region replicated object storage for tenant assets, documents, and backup archives.
Auto-scaling Configuration:
| Service | Min Max |     | Scale Trigger |
| ------- | ------- | --- | ------------- |
CPU > 70% or Request latency > 200ms (sustained 3
| API Service (ECS Fargate) | 2   | 8   |     |
| ------------------------- | --- | --- | --- |
min)
Worker Service (ECS Queue depth > 1,000 or Job latency > 30s (sustained 2
|          | 2 6 |     |      |
| -------- | --- | --- | ---- |
| Fargate) |     |     | min) |
Read replica for read-heavy workloads; auto-failover on
| RDS PostgreSQL | 1 2 (read replica) |     |     |
| -------------- | ------------------ | --- | --- |
primary failure
Cluster mode enabled; scale shards based on memory
| ElastiCache Redis | 3   | 6   |     |
| ----------------- | --- | --- | --- |
utilization

2. DATABASE ERD SCHEMA DEFINITION
2.1 Schema Design Principles
Every table contains tenant_id UUID NOT NULL as the first column. All foreign keys are composite
(tenant_id, referenced_id) to ensure tenant-scoped referential integrity. RLS policies enforce tenant_id =
current_setting('app.tenant_id')::uuid on all operations. Drizzle ORM provides type-safe schema definitions
with automatic tenant context injection.
2.2 Core Entity Definitions
TENANTS
Primary entity representing a SaaS customer organization. Contains subscription metadata, resource
quotas, and Stripe billing integration. The slug field provides the subdomain for tenant-specific access
URLs.
Fields: id (UUID PK), slug (unique), name, legal_name, tax_id, subscription_tier,
subscription_status, stripe_customer_id, max_users, max_projects, storage_quota_mb,
created_at, updated_at, deleted_at.
TENANT_BRANDING
Per-tenant visual identity configuration. Stores primary/secondary hex colors, logo URL, letterhead, digital
stamp, custom seal, official address and contact details, bank details (JSONB), and custom PDF
header/footer HTML for document generation.
USERS
Tenant-scoped user accounts with role-based access. Supports MFA (TOTP), notification preferences
(JSONB), email/phone verification, and last login tracking. The role field uses a PostgreSQL enum: CEO,
SALES_MANAGER, TECHNICAL_LEAD, FIELD_ENGINEER, FINANCE, WAREHOUSE_MANAGER,
DISPATCHER, CUSTOMER, ADMIN.
PERMISSIONS (Granular Overrides)
Resource-level permission overrides beyond role defaults. Each row grants a specific user a specific
action on a specific module, optionally scoped to a single resource. Supports time-bound access with
expires_at.
CUSTOMERS
CRM entity for elevator project clients. Includes contact details, geolocation (lat/lng), customer type
(RESIDENTIAL, COMMERCIAL, GOVERNMENT), credit limit, outstanding balance, payment terms, and
tags.
CUSTOMER_FINGERPRINTS

Fuzzy matching index for duplicate detection. Stores Soundex of name, normalized phone, trigram
indexes for name and address, and geohash for proximity-based matching. Rebuilt weekly via cron job.
ELEVATOR_SPECS
Technical specification and pricing records for elevator configurations. Contains both input parameters
(capacity, stops, height, speed, machine room type, door type, building usage) and calculated outputs
(shaft dimensions, car dimensions, pit depth, overhead clearance, counterweight mass, motor power,
guide rail spec, machine room dimensions). Also stores all pricing components: base cost, stop cost,
capacity multiplier, speed premium, door premium, installation cost, freight cost, margin percent, tax
percent, and total price. Supports template mode for reusable configurations.
PROJECTS
Master entity for elevator installation projects tracking the full sales-to-delivery lifecycle. Status enum:
LEAD, SITE_SURVEY, SPEC_CALCULATION, QUOTATION, PROFORMA, CONTRACT, EXECUTION,
COMPLETED, CANCELLED. Contains site geolocation, financial fields (quoted_amount,
contract_amount), timeline tracking, and assignment fields (sales_rep_id, technical_lead_id,
project_manager_id).
PROJECT_PHASES
Installation phase tracking with digital checklist and sign-off. Phase enum: SHAFT_PREPARATION,
MECHANICAL_ASSEMBLY, ELECTRICAL_WIRING, TESTING_COMMISSIONING, HANDOVER,
COMPLETED. Each phase contains a JSONB checklist_items array with per-item completion tracking,
photo URLs, and notes. Customer sign-off captures signature image, stamp image, signatory name, and
timestamp.
CREWS & CREW_MEMBERS
Field technician crew definitions. Crews have a type (INSTALLATION, MAINTENANCE, EMERGENCY)
and active status. Crew members link users to crews with an is_lead flag. Many-to-many relationship
allows technicians to belong to multiple crews.
MAINTENANCE_CONTRACTS
Service agreement records defining periodic maintenance terms. Supports custom recurrence via
interval_type enum (DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, BIANNUAL, ANNUAL,
CUSTOM) with custom_interval_days for non-standard cycles. Tracks coverage terms: max emergency
calls per month, parts coverage percent, labor coverage percent. Financial fields: monthly_fee, currency,
payment_terms.
MAINTENANCE_TICKETS
Scheduled or ad-hoc maintenance work orders. Status workflow: OPEN -> ASSIGNED -> EN_ROUTE ->
IN_PROGRESS -> RESOLVED -> CLOSED. SLA tracking with response and resolution deadlines, breach
flag, and breach timestamp. Work details: description, findings, recommendations. Customer feedback:
rating 1-5, text feedback, signature capture.
TICKET_PARTS

Parts consumption records linked to maintenance or breakdown tickets. Automatically triggers inventory
deduction on ticket completion. Tracks quantity used, unit cost at time of use, warranty flag, and notes.
BREAKDOWN_TICKETS
Emergency breakdown and public-reported incidents. Supports anonymous reporting via QR code
(reporter_type: PUBLIC). Issue categories: TRAPPED_PASSENGERS, DOOR_MALFUNCTION,
POWER_FAILURE, CONTROL_FAILURE, MECHANICAL_FAILURE, etc. Severity levels: LOW,
MEDIUM, HIGH, CRITICAL, EMERGENCY. SLA response time defaults: 60 minutes for emergency, 240
minutes for standard. QR code ID links to installed elevator for automatic location resolution.
INSTALLED_ELEVATORS
Asset registry of completed elevator installations. Snapshot of spec parameters at installation time
(JSONB). Warranty tracking with start/end dates. QR code generation for public breakdown reporting.
Links to active maintenance contract and last/next service dates. Status: ACTIVE,
UNDER_MAINTENANCE, OUT_OF_SERVICE, DECOMMISSIONED.
WAREHOUSES, INVENTORY_CATEGORIES, INVENTORY_ITEMS
Multi-warehouse inventory management. Items classified by type: CONTROLLER, ROPE, GUIDE_SHOE,
BUTTON, DOOR_OPERATOR, MOTOR, BRAKE, etc. Each item tracks manufacturer, model, part
number, unit cost, selling price, dimensions, weight, and reorder parameters.
STOCK_LEVELS
Per-warehouse, per-item stock tracking. Three quantity fields: quantity_on_hand (physical),
quantity_reserved (allocated to open tickets), quantity_available (on_hand - reserved). Last physical count
timestamp for audit trail.
INVENTORY_TRANSACTIONS
Immutable ledger of all stock movements. Transaction types: RECEIPT, ISSUE, RETURN,
ADJUSTMENT, TRANSFER. References purchase orders, tickets, or manual adjustments. Source and
destination warehouse fields support inter-warehouse transfers.
INVOICES & INVOICE_LINE_ITEMS
Accounts receivable records with full line-item detail. Invoice types: STANDARD, MAINTENANCE,
INSTALLMENT, CREDIT_NOTE. Reference linking to projects, contracts, or tickets. Stripe integration for
online payment. Status tracking: OUTSTANDING, PARTIAL, PAID, OVERDUE, WRITTEN_OFF.
PAYMENTS
Payment receipt records linked to invoices. Supports multiple payment methods: CASH, CHECK,
BANK_TRANSFER, CREDIT_CARD (via Stripe). Reference number tracking for reconciliation. Stripe
payment intent ID for chargeback handling.
DOCUMENTS

Generated document registry. Types: QUOTATION, PROFORMA, CONTRACT, INVOICE, REPORT,
CERTIFICATE. Stores S3 URL, file size, MIME type, and generation metadata for audit trail.
NOTIFICATIONS
User notification inbox with multi-channel delivery tracking. Channels: IN_APP, EMAIL, SMS, PUSH.
Priority levels: LOW, NORMAL, HIGH, URGENT. JSONB data field stores deep links and reference IDs for
in-app navigation.
2.3 PostgreSQL RLS Policies
Row-Level Security is enabled on all tenant-scoped tables. A single tenant_isolation policy template is
applied to each table, enforcing that only rows matching the current session's app.tenant_id configuration
value are visible or modifiable. A separate admin_bypass policy allows platform super-administrators to
access all tenant data for support and operational purposes.
The set_tenant_context(tenant_uuid UUID) function executes SET_CONFIG('app.tenant_id',
tenant_uuid::text, false) before each database transaction. Drizzle ORM middleware automatically calls
this function using the tenant_id extracted from the authenticated user's JWT token.
2.4 Referential Integrity Strategy
All foreign keys are composite: (tenant_id, referenced_id). This ensures that a project can only reference
customers within the same tenant, a ticket can only reference contracts within the same tenant, and
inventory transactions can only reference items within the same tenant. The database enforces this at the
constraint level, preventing application bugs from creating cross-tenant data corruption.

3. MODULE-BY-MODULE API ENDPOINT
SPECIFICATIONS
3.1 REST API Standards
Aspect Standard
Base URL https://api.elevator-erp.com/v1
Authentication Bearer JWT with tenant_id claim
Content-Type application/json
Pagination Cursor-based for large datasets; offset-based for small lists
Rate Limiting 1,000 req/min per tenant (configurable by tier)
Error Format RFC 7807 Problem Details
3.2 Module 1: Multi-Tenant & Branding Engine
Manages tenant isolation, visual identity, and resource quotas. All endpoints require authentication and
enforce tenant context via JWT.
Method Endpoint Description Auth
Retrieve current tenant configuration and
GET /tenants/me Any
subscription status
Retrieve tenant branding: colors, logos, addresses,
GET /tenants/me/branding Any
bank details
CEO,
PATCH /tenants/me/branding Update branding configuration (CEO/Admin only)
ADMIN
CEO,
POST /tenants/me/branding/logo Upload logo image (multipart/form-data, max 5MB)
ADMIN
CEO,
POST /tenants/me/branding/stamp Upload digital stamp/seal image
ADMIN
CEO,
POST /tenants/me/branding/letterhead Upload letterhead template (PDF)
ADMIN
Get current resource usage: storage consumed, CEO,
GET /tenants/me/usage
active users, project count vs quotas ADMIN
3.3 Module 2: Elevator Technical & Pricing Calculator

Provides dynamic elevator specification calculations and pricing based on EN 81-20/50, ISO 8100, and
ASME  A17.1  standards.  The  calculate  endpoint  is  stateless  and  does  not  persist  data;  the  POST
/elevator-specs endpoint saves a calculated configuration.
| Method Endpoint |     | Description |     | Auth |
| --------------- | --- | ----------- | --- | ---- |
Calculate specs and pricing from input parameters
| POST /elevator-specs/calculate |     |     |     | Any |
| ------------------------------ | --- | --- | --- | --- |
(stateless)
SALES_M
GR, TECH
POST /elevator-specs Create and persist a new elevator specification
_LEAD,
ADMIN
List specifications with filtering (template, capacity
| GET /elevator-specs |     |     |     | Any |
| ------------------- | --- | --- | --- | --- |
range, building usage)
GET /elevator-specs/:id Get specification by ID with full pricing breakdown Any
SALES_M
Update specification (draft only; locked after project
| PATCH /elevator-specs/:id |     |     |     | GR, TECH |
| ------------------------- | --- | --- | --- | -------- |
linkage)
_LEAD
SALES_M
| DELETE /elevator-specs/:id |     | Soft delete specification |     | GR, |
| -------------------------- | --- | ------------------------- | --- | --- |
ADMIN
GET /elevator-specs/templates List template specifications (is_template = true) Any
SALES_M
POST /elevator-specs/:id/duplicate Clone specification as new template or project spec GR, TECH
_LEAD
|     |     | Get current pricing coefficients and base cost |     | CEO, |
| --- | --- | ---------------------------------------------- | --- | ---- |
GET /elevator-specs/pricing-factors
|     |     | matrix |     | ADMIN |
| --- | --- | ------ | --- | ----- |
CEO,
PATCH /elevator-specs/pricing-factors Update pricing coefficients (CEO/Admin only)
ADMIN
Calculation Input Parameters
| Parameter  | Type    | Constraints | Description             |     |
| ---------- | ------- | ----------- | ----------------------- | --- |
| capacityKg | integer | 320 – 5000  | Rated load in kilograms |     |
Derived from capacityKg /
| capacityPersons | integer |     | Passenger capacity (persons) |     |
| --------------- | ------- | --- | ---------------------------- | --- |
75
| stops | integer | 2 – 64 | Number of served stops |     |
| ----- | ------- | ------ | ---------------------- | --- |
travelHeightM decimal(8,2) 3.00 – 200.00 Total travel height in meters
speedMs decimal(4,2) 0.40 – 10.00 Rated speed in meters per second
machineRoomType enum MR | MRL Machine Room vs Machine Room Less

| Parameter | Type | Constraints | Description |
| --------- | ---- | ----------- | ----------- |
CENTER_OPEN |
| doorType | enum |     | Car door configuration |
| -------- | ---- | --- | ---------------------- |
TELESCOPIC | SWING
doorWidthMm integer 700 – 1400 Clear door opening width in millimeters
RESIDENTIAL |
Building classification for load and safety
| buildingUsage | enum | COMMERCIAL | |     |
| ------------- | ---- | ------------ | --- |
factors
HOSPITAL | INDUSTRIAL
marginPercent decimal(5,2) 0.00 – 100.00 Profit margin percentage
taxPercent decimal(5,2) 0.00 – 50.00 Applicable tax/VAT percentage
Calculation Output: Technical Specifications
| Output | Unit | Standard |     |
| ------ | ---- | -------- | --- |
shaftWidthMm mm EN 81-20 shaft width = car_width + 2 * wall_clearance
shaftDepthMm mm EN 81-20 shaft depth = car_depth + wall_clearance + counterweight_side
| carWidthMm  | mm  | max(1100, floor(0.6 * sqrt(Q) + 200)) |     |
| ----------- | --- | ------------------------------------- | --- |
| carDepthMm  | mm  | max(1400, floor(0.8 * sqrt(Q) + 300)) |     |
| carHeightMm | mm  | 2300 + 50 if HOSPITAL                 |     |
| pitDepthMm  | mm  | 1400 + (50 * N) + speed_adjustment    |     |
overheadClearanceMm mm 4200 + (100 * N) + speed_adjustment - 1500 if MRL
counterweightMassKg kg Q * (0.45 - 0.05 if v > 2.5 + 0.05 if INDUSTRIAL)
motorPowerKw kW (Q * v * 9.81 * eff_factor) / (1000 * mech_efficiency)
| guideRailSpec | string | T75-3/B to T140-3/B based on Q and v |     |
| ------------- | ------ | ------------------------------------ | --- |
machineRoomDimensions mm Null if MRL; shaft_width + 600 x max(3000, shaft_depth + 1000) x 2500 if MR
Calculation Output: Pricing Breakdown

> **RETIRED, August 2026.** The multiplier model this section described
> (`Q_base * N_factor * v_factor * ...`, plus speed/door premiums,
> installation and a USD-denominated freight minimum) was withdrawn: its
> `Q_base` matrix was denominated in USD and a "currency fix" relabelled it
> ETB without converting, under-quoting every machine by roughly 100x.
> Pricing now comes from the product owner's own ETB price list.
> **`docs/elevator-calc-formulas.md` §4.2 is the authority** — this section
> is kept only so the change is traceable. Nothing in §4.1 (the EN 81
> technical calculations above) changed.

| Component | Formula |
| --- | --- |
| basePrice | Price-list base for the product type; PASSENGER steps by stop count |
| stopsAdjustment | max(0, N - 10) * per-stop rate |
| capacityAdjustment | max(0, Q - 630) * per-kg rate |
| marginAmount | (basePrice + stopsAdjustment + capacityAdjustment) * margin_percent |
| taxAmount | (total_before_margin + margin) * tax_percent |
| totalPrice | total_before_margin + margin + tax |

3.4 Module 3: Sales, Quotations & Duplicate Detection
CRM  lifecycle  management  from  lead  acquisition  through  contract  execution.  Includes  algorithmic
duplicate  prevention  using  fuzzy  matching  on  customer  name  (Soundex  +  trigram),  phone  number
(normalized), building name, and geolocation proximity (geohash + haversine distance).
| Method Endpoint | Description | —   |
| --------------- | ----------- | --- |
List customers with search, filter, and
| GET /customers |     | —   |
| -------------- | --- | --- |
pagination
Create new customer with duplicate
| POST /customers |     | —   |
| --------------- | --- | --- |
check
Fuzzy match check before creation;
POST /customers/check-duplicate returns similarity scores and existing —
matches
Get customer with projects, contracts,
| GET /customers/:id |     | —   |
| ------------------ | --- | --- |
invoices
| PATCH /customers/:id  | Update customer details                   | —   |
| --------------------- | ----------------------------------------- | --- |
| DELETE /customers/:id | Soft delete customer                      | —   |
| GET /projects         | List projects with pipeline status filter | —   |
| POST /projects        | Create new project/lead                   | —   |
Get project with full timeline and status
| GET /projects/:id |     | —   |
| ----------------- | --- | --- |
history
Advance project through workflow with
| PATCH /projects/:id/status |     | —   |
| -------------------------- | --- | --- |
validation
Convert lead to next stage (site survey,
| POST /projects/:id/convert |     | —   |
| -------------------------- | --- | --- |
quotation, proforma, contract)
Generate quotation from linked elevator
| POST /projects/:id/quotations |     | —   |
| ----------------------------- | --- | --- |
spec
Approve quotation (Sales Manager+
| POST /quotations/:id/approve |     | —   |
| ---------------------------- | --- | --- |
required)
Convert approved quotation to proforma
| POST /quotations/:id/convert-proforma |     | —   |
| ------------------------------------- | --- | --- |
invoice
Convert proforma to contract with
| POST /quotations/:id/convert-contract |     | —   |
| ------------------------------------- | --- | --- |
milestone tracking
Generate branded PDF with tenant logo,
| POST /quotations/:id/generate-pdf |     | —   |
| --------------------------------- | --- | --- |
colors, stamps
POST /quotations/:id/send Email PDF to customer with tracking —

Duplicate Detection Algorithm
The duplicate detection engine combines four matching signals into a composite similarity score (0.0 –
1.0). A score above 0.75 triggers a REVIEW_BEFORE_CREATE recommendation; above 0.90 triggers a
HIGH_CONFIDENCE_DUPLICATE block.
| Signal | Algorithm |     | Weight | Threshold |
| ------ | --------- | --- | ------ | --------- |
PostgreSQL pg_trgm similarity() on normalized
| Name Similarity |     |     | 35% | ‡ 0.80 |
| --------------- | --- | --- | --- | ------ |
name + Soundex match bonus
E.164 normalization + exact match on primary
| Phone Match |     |     | 25% | Exact |
| ----------- | --- | --- | --- | ----- |
and alternate phones
Geohash prefix match (5 chars = ~2.4km) +
| Geolocation Proximity |     |     | 25% | < 100m |
| --------------------- | --- | --- | --- | ------ |
Haversine distance < 100m
Building Name
|     | pg_trgm similarity() on normalized building name |     | 15% | ‡ 0.75 |
| --- | ------------------------------------------------ | --- | --- | ------ |
Similarity
Project Status Workflow
The project lifecycle enforces a directed acyclic graph of status transitions. Each transition can have
blocking conditions (e.g., quotation must be approved before converting to proforma) and automated side
effects (e.g., status change to CONTRACT triggers crew assignment workflow).
| Status | Next Allowed | Blocking Conditions | Auto-Effects |     |
| ------ | ------------ | ------------------- | ------------ | --- |
SITE_SURVEY,
| LEAD |     | None | Create customer if new |     |
| ---- | --- | ---- | ---------------------- | --- |
CANCELLED
SPEC_CALCULATION,
| SITE_SURVEY |     | Survey report uploaded | None |     |
| ----------- | --- | ---------------------- | ---- | --- |
CANCELLED
| SPEC_CALCUL | QUOTATION, | Elevator spec created and |     |     |
| ----------- | ---------- | ------------------------- | --- | --- |
None
| ATION | CANCELLED | validated |     |     |
| ----- | --------- | --------- | --- | --- |
PROFORMA, Quotation approved by Sales Generate quotation PDF, email
QUOTATION
|     | CANCELLED | Manager+ | customer |     |
| --- | --------- | -------- | -------- | --- |
PROFORMA CONTRACT, CANCELLED Customer acceptance recorded Generate proforma PDF
EXECUTION, Contract signed, deposit Create project phases, assign
CONTRACT
|           | CANCELLED | received                 | crews                            |     |
| --------- | --------- | ------------------------ | -------------------------------- | --- |
|           |           | All phases completed and | Generate completion certificate, |     |
| EXECUTION | COMPLETED |                          |                                  |     |
|           |           | signed off               | create installed_elevator record |     |

3.5 Module 4: Field Installation & Crew Management
Manages installation project execution through five sequential phases with digital checklist completion,
photo documentation, and customer sign-off capture. Crews are dynamically assigned to phases based on
availability and skill requirements.
| Method Endpoint | Description                            | —   |
| --------------- | -------------------------------------- | --- |
| GET /crews      | List crews with type and status filter | —   |
| POST /crews     | Create new crew                        | —   |
Get crew with member list and
| GET /crews/:id |     | —   |
| -------------- | --- | --- |
current assignments
| POST /crews/:id/members           | Add member to crew      | —   |
| --------------------------------- | ----------------------- | --- |
| DELETE /crews/:id/members/:userId | Remove member from crew | —   |
Get all phases for project with
| GET /projects/:id/phases |     | —   |
| ------------------------ | --- | --- |
progress
Assign crew and lead engineer to
| POST /projects/:id/phases/:phaseId/assign |     | —   |
| ----------------------------------------- | --- | --- |
phase
PATCH /projects/:id/phases/:phaseId/start Mark phase as in-progress —
Update checklist item completion
| POST /projects/:id/phases/:phaseId/checklist |     | —   |
| -------------------------------------------- | --- | --- |
status
Upload phase documentation photos
| POST /projects/:id/phases/:phaseId/photos |     | —   |
| ----------------------------------------- | --- | --- |
(multipart)
Capture customer digital signature
| POST /projects/:id/phases/:phaseId/sign-off |     | —   |
| ------------------------------------------- | --- | --- |
and stamp
Complete phase, auto-create next
| PATCH /projects/:id/phases/:phaseId/complete |     | —   |
| -------------------------------------------- | --- | --- |
phase
GET /field/my-assignments Field engineer: today's assignments —
Field engineer: update phase status
| PATCH /field/phases/:id/status |     | —   |
| ------------------------------ | --- | --- |
from mobile
| POST /field/location | Update technician GPS location | —   |
| -------------------- | ------------------------------ | --- |
Installation Phase Checklist Structure
Each phase contains a JSONB array of checklist items. Each item has: id (UUID), label (display text),
required (boolean), completed (boolean), completedAt (ISO timestamp), completedBy (user ID), photoUrl
(S3 URL), and notes (text). All required items must be completed before phase completion. Photo upload
is mandatory for safety-critical items.

3.6 Module 5: Custom Maintenance & Service Engine
Automated  maintenance  scheduling  with  custom  recurrence  cycles.  The  ticket  generator  cron  job
evaluates  each  active  contract  daily,  calculating  the  next  service  date  based  on  interval_type  and
custom_interval_days. Supports technician dispatch with route optimization and interactive map view.
| Method Endpoint | Description | —   |
| --------------- | ----------- | --- |
List contracts with status and date
| GET /maintenance-contracts |     | —   |
| -------------------------- | --- | --- |
filters
POST /maintenance-contracts Create new maintenance contract —
Get contract with full service
| GET /maintenance-contracts/:id |     | —   |
| ------------------------------ | --- | --- |
schedule
| PATCH /maintenance-contracts/:id | Update contract terms | —   |
| -------------------------------- | --------------------- | --- |
Renew contract with optional term
| POST /maintenance-contracts/:id/renew |     | —   |
| ------------------------------------- | --- | --- |
changes
Suspend contract (pause ticket
| POST /maintenance-contracts/:id/suspend |     | —   |
| --------------------------------------- | --- | --- |
generation)
POST /maintenance-contracts/:id/cancel Cancel contract with reason —
GET /maintenance-contracts/:id/schedule Get full upcoming service date list —
List tickets with status and date
| GET /maintenance-tickets |     | —   |
| ------------------------ | --- | --- |
filters
| POST /maintenance-tickets | Create manual maintenance ticket | —   |
| ------------------------- | -------------------------------- | --- |
Get ticket with parts used and
| GET /maintenance-tickets/:id |     | —   |
| ---------------------------- | --- | --- |
service history
PATCH /maintenance-tickets/:id/assign Assign technician to ticket —
Update ticket status through
| PATCH /maintenance-tickets/:id/status |     | —   |
| ------------------------------------- | --- | --- |
workflow
Record parts used (triggers inventory
| POST /maintenance-tickets/:id/parts |     | —   |
| ----------------------------------- | --- | --- |
deduction)
POST /maintenance-tickets/:id/complete Complete ticket with work report —
List available technicians with
| GET /dispatch/technicians |     | —   |
| ------------------------- | --- | --- |
location
POST /dispatch/optimize-route Optimize daily route for technician —
Get map data for dispatch
| GET /dispatch/map-view |     | —   |
| ---------------------- | --- | --- |
dashboard
Maintenance Recurrence Configuration

| Interval Type | Calculation                       | Example            |
| ------------- | --------------------------------- | ------------------ |
| DAILY         | next_date = last_date + 1 day     | Every day          |
| WEEKLY        | next_date = last_date + 7 days    | Every 7 days       |
| BIWEEKLY      | next_date = last_date + 14 days   | Every 14 days      |
| MONTHLY       | next_date = same day next month   | 1st of every month |
| QUARTERLY     | next_date = last_date + 3 months  | Every 3 months     |
| BIANNUAL      | next_date = last_date + 6 months  | Every 6 months     |
| ANNUAL        | next_date = last_date + 12 months | Every year         |
Every 15 days, every 45
| CUSTOM | next_date = last_date + custom_interval_days |     |
| ------ | -------------------------------------------- | --- |
days, etc.

3.7 Module 6: Breakdown & Emergency Dispatch Ticketing
Emergency  breakdown  management  with  public  QR  code  reporting,  real-time  SLA  monitoring,  and
automated technician dispatch. The public portal requires no authentication — breakdowns are reported
by scanning a QR code affixed to each elevator car, which encodes the tenant slug and elevator identifier.
| Method Endpoint | Description | Auth |
| --------------- | ----------- | ---- |
Report breakdown via QR code (no auth
| POST /public/breakdown-report |     | None |
| ----------------------------- | --- | ---- |
required)
GET /public/breakdown/:ticketCode/status Check ticket status publicly None
POST /public/breakdown/:ticketCode/feedback Submit post-resolution feedback None
| GET /breakdown-tickets     | List breakdown tickets (internal) | Any |
| -------------------------- | --------------------------------- | --- |
| POST /breakdown-tickets    | Create internal breakdown report  | Any |
| GET /breakdown-tickets/:id | Get ticket with full timeline     | Any |
DISPAT
CHER, T
| PATCH /breakdown-tickets/:id/assign | Assign technician | ECH_LE |
| ----------------------------------- | ----------------- | ------ |
AD,
CEO
Assigne
Update status: OPEN fi ASSIGNED fi
|     | EN_ROUTE fi IN_PROGRESS fi RESOLVED | d tech, |
| --- | ----------------------------------- | ------- |
PATCH /breakdown-tickets/:id/status
|     | fi CLOSED | DISPAT |
| --- | --------- | ------ |
CHER
DISPAT
CHER,
| POST /breakdown-tickets/:id/escalate | Escalate to supervisor |     |
| ------------------------------------ | ---------------------- | --- |
Assigne
d tech
Assigne
POST /breakdown-tickets/:id/resolve Resolve with root cause and corrective action
d tech
GET /breakdown-tickets/:id/sla Get SLA status and breach risk assessment Any
DISPAT
| GET /on-call/schedule | Get on-call technician schedule | CHER, |
| --------------------- | ------------------------------- | ----- |
CEO
DISPAT
| POST /on-call/schedule | Set on-call schedule | CHER, |
| ---------------------- | -------------------- | ----- |
CEO
DISPAT
CHER,
POST /dispatch/emergency Emergency auto-dispatch to nearest on-call tech
SYSTE
M
SLA Response Time Matrix

Resolution
| Severity | Response SLA |     | Notification Channels |
| -------- | ------------ | --- | --------------------- |
SLA
EMERGENCY (Trapped
|     | 30 minutes | 2 hours | SMS + Push + Phone call |
| --- | ---------- | ------- | ----------------------- |
passengers)
CRITICAL (Safety hazard) 60 minutes 4 hours SMS + Push + Email
| HIGH (Major malfunction) | 4 hours  | 24 hours        | SMS + Push   |
| ------------------------ | -------- | --------------- | ------------ |
| MEDIUM (Partial failure) | 24 hours | 72 hours        | Push + Email |
| LOW (Minor issue)        | 48 hours | 5 business days | Email        |
Breakdown Status Workflow
OPEN: Ticket created via QR scan or internal report. System immediately notifies on-call dispatcher.
ASSIGNED: Dispatcher assigns technician. SMS and push notification sent to technician with location link.
EN_ROUTE: Technician acknowledges and starts travel. GPS tracking begins. Customer receives ETA
notification.
IN_PROGRESS: Technician arrives on site and begins work. Timer starts for resolution SLA.
RESOLVED:  Technician  completes  repair  and  submits  report.  Parts  used  are  auto-deducted  from
inventory.
CLOSED: Customer confirms resolution or auto-closes after 48 hours. Service report PDF generated and
emailed.

3.8 Module 7: Inventory, Parts & Warehouse Control
Multi-warehouse stock tracking with automatic deduction on maintenance/repair completion. Supports
inter-warehouse transfers, physical count reconciliation, and automated reorder alerts when stock falls
below configured reorder levels.
| Method Endpoint               |     | Description                 |     | —   |
| ----------------------------- | --- | --------------------------- | --- | --- |
| GET /warehouses               |     | List warehouses             |     | —   |
| POST /warehouses              |     | Create warehouse            |     | —   |
| GET /warehouses/:id/inventory |     | Get warehouse stock summary |     | —   |
List items with search and category
| GET /inventory-items |     |     |     | —   |
| -------------------- | --- | --- | --- | --- |
filter
| POST /inventory-items |     | Create new inventory item |     | —   |
| --------------------- | --- | ------------------------- | --- | --- |
Get item with stock levels across
| GET /inventory-items/:id |     |     |     | —   |
| ------------------------ | --- | --- | --- | --- |
warehouses
GET /inventory-items/low-stock Get items below reorder level —
| GET /inventory-items/:id/history |     | Get transaction history        |     | —   |
| -------------------------------- | --- | ------------------------------ | --- | --- |
| POST /stock/receipt              |     | Record stock receipt (GRN)     |     | —   |
| POST /stock/issue                |     | Issue stock to ticket/project  |     | —   |
| POST /stock/transfer             |     | Transfer between warehouses    |     | —   |
| POST /stock/return               |     | Return stock to warehouse      |     | —   |
| GET /stock/valuation             |     | Get inventory valuation report |     | —   |
Get auto-generated reorder
| GET /purchase/reorder-alerts |     |     |     | —   |
| ---------------------------- | --- | --- | --- | --- |
suggestions
Approve reorder and generate PO
| POST /purchase/reorder-alerts/:id/approve |     |     |     | —   |
| ----------------------------------------- | --- | --- | --- | --- |
suggestion
Inventory Item Classification
Typical Reorder
| Item Type | Description |     |     |     |
| --------- | ----------- | --- | --- | --- |
Level
| CONTROLLER | Elevator control system units and PCBs |     | 2 units    |     |
| ---------- | -------------------------------------- | --- | ---------- | --- |
| ROPE       | Traction ropes and compensation cables |     | 500 meters |     |
| GUIDE_SHOE | Sliding and roller guide shoes         |     | 20 pieces  |     |
| BUTTON     | Car and landing call buttons           |     | 50 pieces  |     |

Typical Reorder
| Item Type | Description |     |
| --------- | ----------- | --- |
Level
| DOOR_OPERATOR | Door operator motors and controllers | 3 units |
| ------------- | ------------------------------------ | ------- |
| MOTOR         | Traction machine motors              | 1 unit  |
| BRAKE         | Machine brakes and brake pads        | 10 sets |
| SAFETY_GEAR   | Overspeed governors and safety gears | 2 units |

3.9 Module 8: Finance, Invoicing & Automated Reminders
Automated  billing  for  maintenance  contracts  with  batch  invoice  generation,  payment  tracking,  and
multi-channel reminder dispatch. Integrates with Stripe for online payment processing and supports
multiple currencies per tenant.
| Method Endpoint |     | Description |     | —   |
| --------------- | --- | ----------- | --- | --- |
List invoices with status and date
| GET /invoices |     |     |     | —   |
| ------------- | --- | --- | --- | --- |
filters
| POST /invoices |     | Create manual invoice |     | —   |
| -------------- | --- | --------------------- | --- | --- |
Get invoice with line items and
| GET /invoices/:id |     |     |     | —   |
| ----------------- | --- | --- | --- | --- |
payment history
| PATCH /invoices/:id         |     | Update invoice (draft only)  |     | —   |
| --------------------------- | --- | ---------------------------- | --- | --- |
| POST /invoices/:id/generate |     | Generate branded PDF invoice |     | —   |
| POST /invoices/:id/send     |     | Email invoice to customer    |     | —   |
POST /invoices/:id/mark-paid Record payment against invoice —
| POST /invoices/:id/credit-note |     | Issue credit note  |     | —   |
| ------------------------------ | --- | ------------------ | --- | --- |
| POST /invoices/:id/write-off   |     | Write off bad debt |     | —   |
POST /billing/generate-batch Generate batch invoices for period —
GET /billing/batch-jobs/:id Get batch job status and progress —
| GET /billing/upcoming |     | Preview upcoming invoices |     | —   |
| --------------------- | --- | ------------------------- | --- | --- |
POST /billing/reminders/send Trigger manual payment reminders —
| GET /finance/dashboard |     | Financial KPI summary |     | —   |
| ---------------------- | --- | --------------------- | --- | --- |
GET /finance/aging-report Accounts receivable aging analysis —
| GET /finance/mrr |     | Monthly Recurring Revenue trend |     | —   |
| ---------------- | --- | ------------------------------- | --- | --- |
Invoice Types and Rules
| Type     | Source                      | Generation | Payment Terms |     |
| -------- | --------------------------- | ---------- | ------------- | --- |
| STANDARD | Manual or project milestone | On-demand  | Per invoice   |     |
Contract terms
MAINTENANCE Active maintenance contract Monthly batch (1st of month)
(default 30 days)
Project contract with payment
| INSTALLMENT |     | Per milestone date | Per contract |     |
| ----------- | --- | ------------------ | ------------ | --- |
schedule

| Type        | Source               | Generation | Payment Terms |
| ----------- | -------------------- | ---------- | ------------- |
| CREDIT_NOTE | Refund or adjustment | Manual     | N/A           |
Automated Reminder Schedule
| Trigger | Timing | Channels | Recipients |
| ------- | ------ | -------- | ---------- |
Payment due soon 7 days before due date Email Customer primary contact
Payment due
|     | 1 day before due date | Email + SMS | Customer primary contact |
| --- | --------------------- | ----------- | ------------------------ |
tomorrow
Payment overdue Day after due date Email + SMS Customer + Sales Manager
Customer + Sales Manager
| Overdue escalation | 7, 14, 30 days overdue | Email + SMS + In-app |     |
| ------------------ | ---------------------- | -------------------- | --- |
+ CEO
30, 15, 7 days before
| Warranty expiry |     | Email | Customer + Sales Manager |
| --------------- | --- | ----- | ------------------------ |
expiry
60, 30, 14 days before
| Contract expiry |     | Email + In-app | Sales Manager + CEO |
| --------------- | --- | -------------- | ------------------- |
expiry
| Upcoming | 3 days before scheduled |     | Customer + Assigned |
| -------- | ----------------------- | --- | ------------------- |
SMS + Push
| maintenance | date |     | technician |
| ----------- | ---- | --- | ---------- |

3.10 Module 9: Executive Dashboard & Analytics
Real-time  and  historical  analytics  providing  executive  visibility  into  business  performance.  KPIs  are
pre-computed every 15 minutes and cached in Redis. Historical aggregates are computed daily and stored
in time-series tables for fast querying.
| Method Endpoint |     | Description | —   |
| --------------- | --- | ----------- | --- |
Executive dashboard with all KPIs
| GET /analytics/dashboard |     |     | —   |
| ------------------------ | --- | --- | --- |
and charts
All KPIs with current values and
| GET /analytics/kpis |     |     | —   |
| ------------------- | --- | --- | --- |
trends
GET /analytics/kpis/:kpiId/history Historical trend for specific KPI —
WebSocket subscription for live KPI
| WS /ws/analytics/real-time |     |     | —   |
| -------------------------- | --- | --- | --- |
updates
| GET /analytics/sales/pipeline |     | Pipeline conversion funnel | —   |
| ----------------------------- | --- | -------------------------- | --- |
GET /analytics/sales/performance Sales rep performance leaderboard —
GET /analytics/operations/sla SLA compliance by ticket category —
GET /analytics/operations/crew-utilization Crew utilization rates and heatmap —
Monthly Recurring Revenue trend
| GET /analytics/finance/mrr |     |     | —   |
| -------------------------- | --- | --- | --- |
(12 months)
| GET /analytics/finance/churn |     | Customer churn rate analysis | —   |
| ---------------------------- | --- | ---------------------------- | --- |
POST /analytics/reports/custom Generate custom report with filters —
POST /analytics/reports/:id/export Export report to CSV/Excel/PDF —
Key Performance Indicators
| KPI | Definition | Calculation | Refresh |
| --- | ---------- | ----------- | ------- |
Count of installed_elevators with
Active Installations COUNT(*) WHERE status = 'ACTIVE' Real-time
status = ACTIVE
| Total Maintenance | Count of maintenance_contracts |                                  |           |
| ----------------- | ------------------------------ | -------------------------------- | --------- |
|                   |                                | COUNT(*) WHERE status = 'ACTIVE' | Real-time |
| Contracts         | with status = ACTIVE           |                                  |           |
Count of breakdown_tickets with
| Open Breakdown |                            | COUNT(*) WHERE status NOT IN |           |
| -------------- | -------------------------- | ---------------------------- | --------- |
|                | status IN (OPEN, ASSIGNED, |                              | Real-time |
| Tickets        |                            | ('RESOLVED', 'CLOSED')       |           |
EN_ROUTE, IN_PROGRESS)
Monthly Recurring Sum of monthly_fee from active SUM(monthly_fee) WHERE status =
Daily
| Revenue (MRR) | maintenance contracts | 'ACTIVE' |     |
| ------------- | --------------------- | -------- | --- |

| KPI | Definition | Calculation | Refresh |
| --- | ---------- | ----------- | ------- |
Sum of balance_due from
SUM(balance_due) WHERE status =
| Overdue Payments | invoices with status = |     | Hourly |
| ---------------- | ---------------------- | --- | ------ |
'OVERDUE'
OVERDUE
|                  | Percentage of tickets resolved | (resolved_within_sla / total_resolved) |           |
| ---------------- | ------------------------------ | -------------------------------------- | --------- |
| SLA Compliance % |                                |                                        | Real-time |
|                  | within SLA deadline            | * 100                                  |           |
Sum of (quantity_on_hand *
| Inventory Valuation |     | SUM(qty * cost) JOIN items | Hourly |
| ------------------- | --- | -------------------------- | ------ |
unit_cost) across all stock levels
|                    | Percentage of billable hours vs | (billable_hours / available_hours) * |       |
| ------------------ | ------------------------------- | ------------------------------------ | ----- |
| Crew Utilization % |                                 |                                      | Daily |
|                    | total available hours           | 100                                  |       |

3.11 WebSocket Contracts (Real-Time)
The WebSocket gateway provides bi-directional real-time communication for live notifications, technician
GPS tracking, and dashboard KPI streaming. Connection requires JWT authentication via the auth event.
| Event | Direction | Payload | Frequency |
| ----- | --------- | ------- | --------- |
Once per
| auth | Client fi Server | { token: JWT, tenantId: UUID } |     |
| ---- | ---------------- | ------------------------------ | --- |
connection
subscribe:tickets Client fi Server { statuses: [], myAssignmentsOnly: boolean } On subscription
Server fi Client
ticket:assigned { ticketId, priority, location, sla } On assignment
On status
ticket:status-change Server fi Client { ticketId, oldStatus, newStatus, timestamp }
update
5 min before
| ticket:sla-warning | Server fi Client | { ticketId, minutesRemaining, severity } |     |
| ------------------ | ---------------- | ---------------------------------------- | --- |
breach
Every 30
| dispatch:location | Server fi Client | { technicianId, lat, lng, status, eta } |     |
| ----------------- | ---------------- | --------------------------------------- | --- |
seconds
| project:phase-complet | Server fi Client |     | On phase |
| --------------------- | ---------------- | --- | -------- |
{ projectId, phase, completionPercentage }
| e   |                  |     | completion |
| --- | ---------------- | --- | ---------- |
|     | Server fi Client |     | On stock   |
inventory:low-stock { itemId, itemName, warehouseId, currentStock }
threshold breach
notification:new Server fi Client { notificationId, type, title, message, data } On event trigger
Every 15
| dashboard:kpi-update | Server fi Client | { kpiId, value, change, timestamp } |     |
| -------------------- | ---------------- | ----------------------------------- | --- |
minutes

4. ELEVATOR CALCULATION & PRICING
MATHEMATICAL SPECIFICATION
4.1 Technical Specification Engine
The  elevator  technical  calculation  engine  converts  input  parameters  into  structural  and  mechanical
specifications using industry-standard formulas derived from EN 81-20/50, ISO 8100, and ASME A17.1
standards. All calculations use arbitrary-precision decimal arithmetic to prevent floating-point errors in
financial computations.
4.1.1 Input Parameters
| Parameter          | Symbol | Unit    | Constraints          |
| ------------------ | ------ | ------- | -------------------- |
| Rated Load         | Q      | kg      | 320 £ Q £ 5000       |
| Passenger Capacity | P      | persons | P = Q / 75 (rounded) |
| Number of Stops    | N      | count   | 2 £ N £ 64           |
| Travel Height      | H      | m       | 3 £ H £ 200          |
0.4 £ v £ 10.0
| Rated Speed | v   | m/s |     |
| ----------- | --- | --- | --- |
MR = Machine Room, MRL = Machine Room
| Machine Room Type | MR/MRL | enum |     |
| ----------------- | ------ | ---- | --- |
Less
| Door Type | D   | enum | CENTER_OPEN, TELESCOPIC, SWING |
| --------- | --- | ---- | ------------------------------ |
700 £ Wd £ 1400
| Door Width | Wd  | mm  |     |
| ---------- | --- | --- | --- |
RESIDENTIAL, COMMERCIAL, HOSPITAL,
| Building Usage | U   | enum |     |
| -------------- | --- | ---- | --- |
INDUSTRIAL
4.1.2 Car Internal Dimensions (EN 81-20)
car_width = max(1100, floor(0.6 × sqrt(Q) + 200)) [mm]
car_depth = max(1400, floor(0.8 × sqrt(Q) + 300)) [mm]
car_height = 2300 + (50 if U = HOSPITAL else 0) [mm]
4.1.3 Shaft Internal Dimensions
wall_clearance_w = 150 + (50 if v > 2.5 else 0) [mm]
wall_clearance_d = 200 + (50 if v > 2.5 else 0) [mm]
shaft_width = car_width + (2 × wall_clearance_w) [mm]
shaft_depth = car_depth + wall_clearance_d + 100 [mm]
4.1.4 Pit Depth
base_pit = 1400 + (50 × N) [mm]
speed_adjustment = max(0, (v - 1.0) × 200) [mm]
pit_depth = base_pit + speed_adjustment + (200 if v > 2.5 else 0) [mm]

4.1.5 Overhead Clearance
base_overhead = 4200 + (100 × N) [mm]
speed_adjustment = max(0, (v - 1.0) × 300) [mm]
overhead_clearance = base_overhead + speed_adjustment [mm]
if MR/MRL = MRL: overhead_clearance = overhead_clearance - 1500 [mm]
4.1.6 Counterweight Mass
counterweight_mass = Q × (0.45 - (0.05 if v > 2.5 else 0) + (0.05 if U = INDUSTRIAL else 0))
[kg]
Standard factor: 0.45 for most applications
High-speed adjustment: -0.05 for v > 2.5 m/s
Freight adjustment: +0.05 for INDUSTRIAL usage
4.1.7 Motor Power
mechanical_efficiency = 0.60 (geared traction) or 0.75 (gearless, v > 1.75 m/s)
efficiency_factor = 1.0 + (0.1 × (v / 2.5))
motor_power_kw = (Q × v × 9.81 × efficiency_factor) / (1000 × mechanical_efficiency) [kW]
motor_power_kw = max(3.0, motor_power_kw)
4.1.8 Guide Rail Selection
Capacity (kg) Speed (m/s) Rail Spec
Q £ 630 v £ 1.0 T75-3/B
Q £ 1000 v £ 1.6 T89-1/B
Q £ 1600 v £ 2.5 T114-1/B
Q £ 2500 v £ 2.5 T127-2/B
Q > 2500 Any T140-3/B
4.1.9 Machine Room Dimensions (MR only)
if MR/MRL = MR:
machine_room_width = shaft_width + 600 [mm]
machine_room_depth = max(3000, shaft_depth + 1000) [mm]
machine_room_height = 2500 + (200 if v > 2.5 else 0) [mm]
else:
all dimensions = null

4.2 Pricing Formula Engine
4.2.1 Base Cost Calculation
BASE_COST = Q_base × N_factor × v_factor × U_factor × D_factor × MR_MRL_factor
Where:
Q_base = lookup from base cost matrix (see table below)
N_factor = 1.0 + (N - 2) × 0.08
v_factor = 1.0 + max(0, (v - 1.0) × 0.15)
U_factor = 1.00 (RESIDENTIAL), 1.15 (COMMERCIAL), 1.25 (HOSPITAL), 1.20 (INDUSTRIAL)
D_factor = 1.00 (CENTER_OPEN), 1.12 (TELESCOPIC), 0.95 (SWING)
MR_MRL_factor = 1.00 (MR), 0.92 (MRL)
Base Cost Lookup Matrix (Q_base in USD)
Capacity (kg) Q_base (USD)
320 28,000
450 32,000
630 36,000
800 40,000
1000 45,000
1150 48,000
1350 52,000
1600 58,000
2000 68,000
2500 82,000
3000 95,000
4000 120,000
5000 145,000
4.2.2 Component Cost Formulas
Component Formula
STOP_COST Q_base × 0.04 × (N - 2)
CAPACITY_MULTIPLIER 1.0 + ((Q - 1000) / 1000) × 0.05, clamped to [0.8, 2.0]

Component Formula
Tiered: +3% per m/s above 1.0, +5% per m/s above 2.5, +8% per m/s
SPEED_PREMIUM
above 4.0
DOOR_PREMIUM TELESCOPIC: +8%; CENTER_OPEN > 1000mm: +3% per 100mm over
INSTALLATION_COST Q_base × 0.15 × (1.0 + (H/50) × 0.02) × hospital(1.2) or industrial(1.15)
(shaft_width × shaft_depth × H / 10^9) × 500 + (counterweight_mass /
FREIGHT_COST
1000) × 200, minimum 800
4.2.3 Final Pricing Formula
EQUIPMENT_SUBTOTAL = BASE_COST + STOP_COST + SPEED_PREMIUM + DOOR_PREMIUM
TOTAL_BEFORE_MARGIN = (EQUIPMENT_SUBTOTAL × CAPACITY_MULTIPLIER) + INSTALLATION_COST +
FREIGHT_COST
MARGIN_AMOUNT = TOTAL_BEFORE_MARGIN × (margin_percent / 100)
SUBTOTAL_WITH_MARGIN = TOTAL_BEFORE_MARGIN + MARGIN_AMOUNT
TAX_AMOUNT = SUBTOTAL_WITH_MARGIN × (tax_percent / 100)
TOTAL_PRICE = SUBTOTAL_WITH_MARGIN + TAX_AMOUNT
4.2.4 Complete Calculation Example
Input: Q = 1000 kg, N = 12 stops, H = 45 m, v = 1.6 m/s, MRL, CENTER_OPEN, Wd = 900 mm,
COMMERCIAL, margin = 25%, tax = 5%
Q_base = 45,000 USD
N_factor = 1.0 + 10 × 0.08 = 1.80
v_factor = 1.0 + 0.6 × 0.15 = 1.09
U_factor = 1.15 (COMMERCIAL)
D_factor = 1.00 (CENTER_OPEN)
MR_MRL_factor = 0.92 (MRL)
BASE_COST = 45,000 × 1.80 × 1.09 × 1.15 × 1.00 × 0.92 = 93,034.62 USD
STOP_COST = 45,000 × 0.04 × 10 = 18,000.00 USD
CAPACITY_MULTIPLIER = 1.00 (Q = 1000)
SPEED_PREMIUM = 45,000 × 0.03 × 0.6 = 810.00 USD
DOOR_PREMIUM = 0.00 (CENTER_OPEN £ 1000mm)
INSTALLATION_COST = 45,000 × 0.15 × 1.018 = 6,885.00 USD
FREIGHT_COST = max(800, 118.80 + 90.00) = 800.00 USD
EQUIPMENT_SUBTOTAL = 93,034.62 + 18,000.00 + 810.00 + 0.00 = 111,844.62 USD
TOTAL_BEFORE_MARGIN = 111,844.62 × 1.00 + 6,885.00 + 800.00 = 119,529.62 USD
MARGIN_AMOUNT = 119,529.62 × 0.25 = 29,882.41 USD
SUBTOTAL_WITH_MARGIN = 119,529.62 + 29,882.41 = 149,412.03 USD
TAX_AMOUNT = 149,412.03 × 0.05 = 7,470.60 USD
TOTAL_PRICE = 156,882.63 USD

5. MULTI-TENANT SECURITY & ROLE-BASED
ACCESS CONTROL MATRIX
5.1 Authentication Architecture
Authentication uses JWT Bearer tokens with short-lived access tokens (15-minute TTL) and longer-lived
refresh  tokens  (7-day  TTL).  The  JWT  payload  contains  the  user's  tenant_id,  role,  and  a  compact
permissions array. Multi-factor authentication (TOTP) is optional per user and enforced at the application
layer before token issuance.
| Layer | Mechanism | Description |
| ----- | --------- | ----------- |
Access token (15min) + Refresh token (7 days). Contains
| Authentication | JWT Bearer Tokens |     |
| -------------- | ----------------- | --- |
tenant_id, role, permissions claims.
PostgreSQL RLS + App SET_CONFIG injects tenant_id before each query. RLS
Tenant Isolation
|     | Middleware | policies enforce at database level. |
| --- | ---------- | ----------------------------------- |
Role Guards + Permission NestJS guards validate role against endpoint metadata.
Authorization
|     | Matrix | Granular permissions allow resource-level overrides. |
| --- | ------ | ---------------------------------------------------- |
1,000 req/min per tenant. Burst: 200 req/10sec.
| Rate Limiting | Redis-backed Throttler |     |
| ------------- | ---------------------- | --- |
Configurable by subscription tier.
All mutations logged with actor, tenant, entity, before/after
| Audit Logging | Async Event Stream |     |
| ------------- | ------------------ | --- |
snapshots. 7-year retention.
5.2 Role Definitions
Nine roles are defined across the platform. Each role has a default permission set covering all modules.
The CEO and Admin roles have full access within their tenant. The Customer role is restricted to viewing
their own projects, contracts, invoices, and breakdown tickets.
| Role | Scope | Primary Responsibilities |
| ---- | ----- | ------------------------ |
Full system access. Manage subscription, branding, user
| CEO | Tenant-wide |     |
| --- | ----------- | --- |
management, financial oversight, all approvals.
Lead management, quotation approval, customer
| SALES_MANAGER | Sales & CRM |     |
| ------------- | ----------- | --- |
relationships, pipeline oversight, contract negotiation.
Elevator spec calculations, project technical oversight, crew
| TECHNICAL_LEAD | Engineering |     |
| -------------- | ----------- | --- |
assignment, installation quality control.
|     | Assigned | Installation phase execution, maintenance service, |
| --- | -------- | -------------------------------------------------- |
FIELD_ENGINEER
|     | projects/tickets | breakdown response, checklist completion, photo upload. |
| --- | ---------------- | ------------------------------------------------------- |
Invoice generation, payment recording, batch billing,
| FINANCE | Financial |     |
| ------- | --------- | --- |
financial reporting, overdue collection.

| Role | Scope |     |     | Primary Responsibilities |     |     |     |     |
| ---- | ----- | --- | --- | ------------------------ | --- | --- | --- | --- |
WAREHOUSE_MAN Stock management, reorder approvals, purchase orders,
Inventory
| AGER |     |     |     | warehouse transfers, physical counts. |     |     |     |     |
| ---- | --- | --- | --- | ------------------------------------- | --- | --- | --- | --- |
Breakdown ticket dispatch, on-call scheduling, technician
| DISPATCHER | Operations |     |     |     |     |     |     |     |
| ---------- | ---------- | --- | --- | --- | --- | --- | --- | --- |
route optimization, SLA monitoring.
View own projects, contracts, invoices. Report breakdowns
| CUSTOMER | Own data only |     |     |     |     |     |     |     |
| -------- | ------------- | --- | --- | --- | --- | --- | --- | --- |
via QR code. Submit feedback.
System configuration, user management, permission
| ADMIN | Tenant-wide |     |     |     |     |     |     |     |
| ----- | ----------- | --- | --- | --- | --- | --- | --- | --- |
overrides, data exports, tenant settings.
5.3 Module-Level Permission Matrix
The matrix below defines default access levels for each role across all functional modules. Granular
permission overrides can extend or restrict access beyond these defaults on a per-resource basis.
|                 |     | Sales | Tech | Field | Fina | Wareh | Dispat | Cust Admi |
| --------------- | --- | ----- | ---- | ----- | ---- | ----- | ------ | --------- |
| Module / Action | CEO |       |      |       |      |       |        |           |
|                 |     | Mgr   | Lead | Eng   | nce  | ouse  | cher   | omer n    |
Tenant Config
|     | 3   | 3   | 3   | 3   | 3   | 3   | 3   | — 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
(View)
| Tenant Config | 3   |     |     |     |     |     |     | 3   |
| ------------- | --- | --- | --- | --- | --- | --- | --- | --- |
|               |     | —   | —   | —   | —   | —   | —   | —   |
(Edit)
|                  | 3   | 3   | 3   | 3   | 3   |     |     | 3   |
| ---------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customers (View) |     |     |     |     |     | —   | —   | Own |
Customers
|     | 3   | 3   | —   | —   | —   | —   | —   | — 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
(Create/Edit)
Elevator Specs
|     | 3   | 3   | 3   | 3   | —   | —   | —   | — 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
(View)
| Elevator Specs | 3   | 3   | 3   |     |     |     |     | 3   |
| -------------- | --- | --- | --- | --- | --- | --- | --- | --- |
|                |     |     |     | —   | —   | —   | —   | —   |
(Create/Edit)
| Pricing Factors | 3   |     |     |     |     |     |     | 3   |
| --------------- | --- | --- | --- | --- | --- | --- | --- | --- |
|                 |     | —   | —   | —   | —   | —   | —   | —   |
(Edit)
Assign
| Projects (View All) | 3   | 3   | 3   |     | —   | —   | —   | Own 3 |
| ------------------- | --- | --- | --- | --- | --- | --- | --- | ----- |
ed
Projects
|     | 3   | 3   | 3   | —   | —   | —   | —   | — 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
(Create/Edit)
| Quotation Approval  | 3   | 3   | —   | —      | —   | —   | —   | — 3 |
| ------------------- | --- | --- | --- | ------ | --- | --- | --- | --- |
| Installation Phases | 3   | 3   | 3   | Assign |     |     |     | 3   |
|                     |     |     |     |        | —   | —   | —   | Own |
| (View)              |     |     |     | ed     |     |     |     |     |
| Phase Crew Assign   | 3   | —   | 3   | —      | —   | —   | —   | — 3 |

|                   |     | Sales | Tech | Field  | Fina Wareh | Dispat Cust | Admi |
| ----------------- | --- | ----- | ---- | ------ | ---------- | ----------- | ---- |
| Module / Action   | CEO |       |      |        |            |             |      |
|                   |     | Mgr   | Lead | Eng    | nce ouse   | cher omer   | n    |
| Phase             |     |       |      | Assign |            |             |      |
|                   | 3   | —     | 3    |        | — —        | — Own       | 3    |
| Complete/Sign-off |     |       |      | ed     |            |             |      |
| Maint. Contracts  |     |       |      | Assign |            |             |      |
|                   | 3   | 3     | 3    |        | 3 —        | — Own       | 3    |
| (View)            |     |       |      | ed     |            |             |      |
| Maint. Contracts  | 3   | 3     |      |        | 3          |             | 3    |
|                   |     |       | —    | —      | —          | — —         |      |
(Create/Edit)
| Maint. Tickets | 3   | 3   | 3   | Assign |     | 3   | 3   |
| -------------- | --- | --- | --- | ------ | --- | --- | --- |
|                |     |     |     |        | — — | Own |     |
| (View)         |     |     |     | ed     |     |     |     |
Maint. Tickets
|     | 3   | —   | 3   | —   | — — | 3 — | 3   |
| --- | --- | --- | --- | --- | --- | --- | --- |
(Assign)
| Breakdown Tickets |     |     |     | Assign |     |       |     |
| ----------------- | --- | --- | --- | ------ | --- | ----- | --- |
|                   | 3   | 3   | 3   |        | — — | 3 Own | 3   |
| (View)            |     |     |     | ed     |     |       |     |
Breakdown
|     | 3   | —   | 3   | —   | — — | 3 — | 3   |
| --- | --- | --- | --- | --- | --- | --- | --- |
Dispatch
|                    | 3   |     | 3   | 3   | 3   |       | 3   |
| ------------------ | --- | --- | --- | --- | --- | ----- | --- |
| Inventory (View)   |     | —   |     |     | —   | — —   |     |
| Inventory (Manage) | 3   | —   | —   | —   | — 3 | — —   | 3   |
| Invoices (View)    | 3   | 3   | —   | —   | 3 — | — Own | 3   |
| Invoices           | 3   |     |     |     | 3   |       | 3   |
|                    |     | —   | —   | —   | —   | — —   |     |
(Create/Edit)
| Batch Billing     | 3   | —   | —   | —   | 3 — | — — | 3   |
| ----------------- | --- | --- | --- | --- | --- | --- | --- |
| Financial Reports | 3   | —   | —   | —   | 3 — | — — | 3   |
| Dashboard         | 3   | 3   | 3   |     | 3   | 3   | 3   |
Limited — —
(Executive)
| User Management | 3   | 3   | —   | —   | — — | — — | 3   |
| --------------- | --- | --- | --- | --- | --- | --- | --- |
Permission
|     | 3   | —   | —   | —   | — — | — — | 3   |
| --- | --- | --- | --- | --- | --- | --- | --- |
Overrides
5.4 Permission Override System
Beyond  role-based  defaults,  the  system  supports  granular  permission  overrides  for  edge  cases:
resource-level grants (a Sales Manager given read access to a specific Finance report), time-bound
permissions (temporary project access for external consultants, max 30 days), and delegation (a CEO
delegates approval authority to a Technical Lead for 48 hours). All overrides require approval and are
logged in the audit trail.

| Override Type | Scope | Max Duration | Approval Required |
| ------------- | ----- | ------------ | ----------------- |
Resource Grant Single resource Manual revocation CEO or Admin
| Time-Bound Access | Module or resource | 30 days           | Manager+ |
| ----------------- | ------------------ | ----------------- | -------- |
| Role Elevation    | Full role          | 4 hours (session) | CEO only |
Emergency Override Breakdown dispatch 24 hours auto-expire Dispatcher+

6. ASYNCHRONOUS WORKER & CRON JOB
SCHEDULE LAYOUT
6.1 BullMQ Queue Architecture
Background processing is handled by BullMQ workers running in a separate ECS service. Each queue has
dedicated workers with configurable concurrency, retry policies, and priority levels. Redis serves as both
the job store and the communication backbone.
Work
| Queue Name | Purpose | Priority | Retry Policy |
| ---------- | ------- | -------- | ------------ |
ers
Document compilation: quotations, invoices,
| pdf-generation |     | 3 High | 3 retries, 30s backoff |
| -------------- | --- | ------ | ---------------------- |
service reports, certificates
5 retries, exponential
| email-dispatch | Transactional emails via SES/SendGrid | 2 High |     |
| -------------- | ------------------------------------- | ------ | --- |
backoff
sms-dispatch SMS notifications via Twilio 2 Critical 5 retries, 10s backoff
| push-notifications | Mobile push via Firebase                   | 2 High   | 3 retries |
| ------------------ | ------------------------------------------ | -------- | --------- |
| maintenance-sche   | Generate periodic maintenance tickets from |          |           |
|                    |                                            | 2 Medium | 2 retries |
| duler              | contract schedules                         |          |           |
Monthly invoice generation for active
| billing-batch |     | 2 Medium | 3 retries, 5min backoff |
| ------------- | --- | -------- | ----------------------- |
maintenance contracts
payment-reminders Overdue payment and expiry notifications 2 Low 2 retries
inventory-alerts Low-stock reorder notifications 1 Low 2 retries
data-exports Large CSV/Excel/PDF report generation 2 Lowest 1 retry
audit-cleanup Archive old audit logs to S3 Glacier 1 Lowest 1 retry
sla-monitor Real-time SLA breach detection and escalation 2 Critical No retry (must not fail)
duplicate-detection Fuzzy match index rebuilding 1 Low 1 retry
| analytics-aggregati | KPI pre-computation and dashboard cache |       |           |
| ------------------- | --------------------------------------- | ----- | --------- |
|                     |                                         | 2 Low | 2 retries |
| on                  | warming                                 |       |           |
6.2 Cron Job Schedule
All cron jobs are registered as repeatable BullMQ jobs with explicit schedules, SLA completion deadlines,
and failure alerting. Jobs execute in UTC and are tenant-aware.

Schedule
| Job Name |     | Queue | Description | SLA |
| -------- | --- | ----- | ----------- | --- |
(UTC)
Generate tickets for contracts where
maintenance-ticket-ge maintenance-sche next_service_date = today. Custom Complete by
Daily 00:00
| nerator |     | duler | intervals: calculate next date based on | 02:00 |
| ------- | --- | ----- | --------------------------------------- | ----- |
custom_interval_days.
Update next_service_date for
maintenance-date-ad maintenance-sche completed tickets. Auto-renew Complete by
Daily 00:30
| vance |     | duler | contracts if auto_renew = true and | 02:00 |
| ----- | --- | ----- | ---------------------------------- | ----- |
within 30 days of expiry.
Generate invoices for all active
|                       | Monthly, 1st |               | maintenance contracts for the        | Complete by |
| --------------------- | ------------ | ------------- | ------------------------------------ | ----------- |
| billing-batch-invoice |              | billing-batch |                                      |             |
|                       | @ 01:00      |               | previous month. Group by customer if | 06:00       |
configured.
|                     |             |                   | Email/SMS reminder for invoices due | Batch within 1 |
| ------------------- | ----------- | ----------------- | ----------------------------------- | -------------- |
| payment-reminder-7d | Daily 08:00 | payment-reminders |                                     |                |
|                     |             |                   | in 7 days.                          | hour           |
|                     |             |                   | Urgent reminder for invoices due    | Batch within 1 |
| payment-reminder-1d | Daily 08:30 | payment-reminders |                                     |                |
|                     |             |                   | tomorrow.                           | hour           |
Overdue notice for invoices past due
| payment-reminder-ov |             |                   |                                       | Batch within 1 |
| ------------------- | ----------- | ----------------- | ------------------------------------- | -------------- |
|                     | Daily 09:00 | payment-reminders | date. Escalate to Sales Manager after |                |
| erdue               |             |                   |                                       | hour           |
30 days.
Scan all stock_levels where
inventory-reorder-sca quantity_available < reorder_level. Complete by
|     | Daily 06:00 | inventory-alerts |                                      |       |
| --- | ----------- | ---------------- | ------------------------------------ | ----- |
| n   |             |                  | Generate alerts and notify Warehouse | 07:00 |
Manager.
Scan open tickets. If now() >
|                     | Every 5 |             | sla_deadline, mark sla_breached =    | Real-time (< 1 |
| ------------------- | ------- | ----------- | ------------------------------------ | -------------- |
| sla-breach-detector |         | sla-monitor |                                      |                |
|                     | minutes |             | true, notify dispatcher, escalate to | min latency)   |
manager.
Recompute real-time KPIs: active
|     | Every 15 | analytics-aggregati |     |     |
| --- | -------- | ------------------- | --- | --- |
analytics-kpi-refresh installations, open tickets, MRR, SLA < 2 min latency
|     | minutes | on  |     |     |
| --- | ------- | --- | --- | --- |
compliance %. Cache in Redis.
Compute daily aggregates: revenue,
|     |     | analytics-aggregati |     | Complete by |
| --- | --- | ------------------- | --- | ----------- |
analytics-daily-rollup Daily 02:00 ticket volume, crew utilization. Store in
|     |     | on  |     | 04:00 |
| --- | --- | --- | --- | ----- |
time-series table.
Notify customers 30, 15, and 7 days
Batch within 1
warranty-expiry-check Daily 07:00 payment-reminders before warranty expiry. Offer
hour
maintenance contract conversion.
Notify Sales Manager 60, 30, and 14
Batch within 1
contract-expiry-check Daily 07:30 payment-reminders days before maintenance contract
hour
expiry.
duplicate-index-rebuil Weekly, Rebuild customer_fingerprints trigram Complete by
duplicate-detection
| d   | Sunday 03:00 |     | and Soundex indexes. | 05:00 |
| --- | ------------ | --- | -------------------- | ----- |
Archive audit logs older than 90 days
|     | Monthly, 15th |     |     | Complete by |
| --- | ------------- | --- | --- | ----------- |
audit-log-archive audit-cleanup to S3 Glacier. Delete from hot
|     | @ 03:00 |     |     | 06:00 |
| --- | ------- | --- | --- | ----- |
storage.

Schedule
| Job Name |     | Queue | Description | SLA |
| -------- | --- | ----- | ----------- | --- |
(UTC)
Delete temporary PDF files older than
| pdf-cleanup-temp | Daily 04:00 | pdf-generation |     | Best effort |
| ---------------- | ----------- | -------------- | --- | ----------- |
24 hours from S3 temp bucket.
|                  | Every 10 |            | Retry jobs in failed state with      |             |
| ---------------- | -------- | ---------- | ------------------------------------ | ----------- |
| failed-job-retry |          | All queues |                                      | Best effort |
|                  | minutes  |            | exponential backoff. Max 5 attempts. |             |

6.3 Event-Driven Async Patterns
The platform uses an event-driven architecture where domain events trigger asynchronous actions across
modules. Events are emitted via BullMQ and consumed by dedicated workers.
| Trigger Event | Async Action | Queue | Delay |
| ------------- | ------------ | ----- | ----- |
Breakdown ticket
|     | Notify on-call technician via SMS + Push | sms-dispatch, push | Immediate |
| --- | ---------------------------------------- | ------------------ | --------- |
created
Breakdown ticket
|     | Send assignment notification + location link | email, sms | Immediate |
| --- | -------------------------------------------- | ---------- | --------- |
assigned
| Breakdown status fi | Update dispatcher map, notify customer of |            |           |
| ------------------- | ----------------------------------------- | ---------- | --------- |
|                     |                                           | push       | Immediate |
| EN_ROUTE            | ETA                                       |            |           |
| Breakdown ticket    | Generate service report PDF, email        |            |           |
|                     |                                           | pdf, email | 5 min     |
| resolved            | customer                                  |            |           |
Maintenance ticket
|     | Deduct inventory, generate service report | pdf, inventory | 2 min |
| --- | ----------------------------------------- | -------------- | ----- |
completed
Invoice generated Email invoice PDF to customer pdf, email 1 min
Payment received Update invoice status, send receipt email Immediate
Project phase
|     | Notify project manager, advance workflow | email, push | Immediate |
| --- | ---------------------------------------- | ----------- | --------- |
completed
Notify warehouse manager, generate PO
| Low stock detected |     | inventory, email | Immediate |
| ------------------ | --- | ---------------- | --------- |
suggestion
SLA breach detected Escalate to manager, log incident sla-monitor, email Immediate
maintenance-sche
| Contract created | Schedule first maintenance ticket |     | 1 min |
| ---------------- | --------------------------------- | --- | ----- |
duler
Customer created Index for duplicate detection duplicate-detection 5 min
6.4 Worker Resilience & Dead Letter Handling
| Scenario | Handling Strategy |     |     |
| -------- | ----------------- | --- | --- |
Move to Dead Letter Queue (DLQ). Alert ops via PagerDuty. Manual review
Job fails after max retries
required.
Worker process crash BullMQ job lock expires after 30s. Job re-queued automatically.
Redis unavailable API queues jobs in memory buffer (max 10,000). Alert if buffer > 50% capacity.
PDF generation timeout (> 60s) Kill Puppeteer process, retry with headless Chrome. Max 2 retries.
External API failure (Twilio/SES) Exponential backoff: 10s, 30s, 2min, 5min, 15min. Alert after 3rd retry.
Database connection pool exhausted Queue job with 30s delay. Scale read replicas if sustained > 5 min.

6.5 Auto-Scaling Triggers
| Metric | Threshold | Action |
| ------ | --------- | ------ |
Queue depth > 1,000 sustained 2 min Scale workers +2 (max 10 per queue type)
Queue depth > 5,000 immediate Alert on-call, enable burst workers
| Worker CPU | > 80% sustained 5 min | Scale ECS service +1 task |
| ---------- | --------------------- | ------------------------- |
PDF queue latency > 30s sustained 3 min Spawn dedicated Puppeteer workers
SMS queue latency > 10s immediate Alert, check Twilio API status
Redis memory > 80% sustained 5 min Evict old cache, alert for cluster resize

APPENDIX A: DATA RETENTION & COMPLIANCE
| Data Category | Retention | Archive Strategy         | Compliance     |
| ------------- | --------- | ------------------------ | -------------- |
| Audit logs    | 7 years   | S3 Glacier after 90 days | SOX, ISO 27001 |
Contract duration + 7
| Customer data |     | Anonymize after 7 years | GDPR Article 17 |
| ------------- | --- | ----------------------- | --------------- |
years
Financial records 10 years S3 Glacier after 2 years Tax regulations
Ticket photos 5 years S3 Glacier after 1 year Industry standard
Breakdown reports 10 years S3 Glacier after 2 years Safety regulations
Email/SMS logs 3 years S3 Standard-IA after 1 year CAN-SPAM, GDPR
| Session logs | 90 days | Deleted automatically | Security policy |
| ------------ | ------- | --------------------- | --------------- |
Failed login attempts 1 year Compressed archive Security policy

APPENDIX B: DISASTER RECOVERY
Parameter Value
Recovery Time Objective (RTO) 4 hours
Recovery Point Objective (RPO) 15 minutes
Backup Frequency Continuous (WAL archiving), Full daily at 02:00 UTC
Backup Retention 30 days hot, 1 year cold (S3 Glacier)
Cross-Region Replication Enabled (us-east-1 fi eu-west-1)
Failover Trigger Automated (RDS Multi-AZ), Manual for region failover

APPENDIX C: PERFORMANCE TARGETS
| Metric                    | Target           | Measurement          |
| ------------------------- | ---------------- | -------------------- |
| API Response Time (p95)   | < 200 ms         | New Relic APM        |
| Dashboard Load Time       | < 1.5 s          | Lighthouse           |
| PDF Generation            | < 5 s            | BullMQ job duration  |
| WebSocket Latency         | < 100 ms         | Ping/pong monitoring |
| Database Query Time (p99) | < 50 ms          | pg_stat_statements   |
| Cron Job Completion       | 100% on-schedule | BullMQ dashboard     |
| Uptime SLA                | 99.95%           | AWS CloudWatch       |
| Concurrent Users          | 500+ per tenant  | Load testing (k6)    |
DOCUMENT END