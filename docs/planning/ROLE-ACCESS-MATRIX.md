# Role access matrix (as built)

Source of truth: the client's requirement document, "ERP System — Shining
Star Electromechanical Works", section *Organizational Structure*. It names
eleven staff roles with their responsibilities and, for four of them, explicit
access rights. The role names below are that document's names, unchanged, and
are the values of the `user_role` enum (migration `0069_document_roles`).

Two values are not staff seats: `ADMIN` is the platform's tenant administrator
(the document gives "system administration" to the CEO; ADMIN is the seat the
platform bootstraps with) and `CUSTOMER` is reserved for the customer portal.

Enforced in two places that must agree: `@Roles()` on each API controller and
`MODULES[].roles` in `web/src/components/module-nav.ts` (the sidebar). CEO and
ADMIN pass every guard (`SUPER_ROLES` in `roles.guard.ts`). A demo login exists
for every role; the login screen lists them.

## The document's roles and what each sees

| Role (document name) | Document says | Sidebar modules | Can do |
| --- | --- | --- | --- |
| CEO | Complete access to all modules and reports | Everything | Everything |
| General Manager | Day-to-day operations: project monitoring, department coordination, operational approval, performance management, management reporting | Everything except Messages and Settings edit | Every module read; sales, project and maintenance approvals; staff accounts below management |
| Marketing Manager | Access: customer database, lead management, marketing reports, campaign management | Dashboard, Customers, Projects, Settings (read) | Register and edit customers; create leads (projects at LEAD); post notifications. Campaigns are not built |
| Sales Manager | Access: sales, quotation, customer modules, sales reports. Quotation and pricing approval | Dashboard, Calculator, Customers, Projects, Quotations, Contracts, Invoices (read), Assets, Maintenance, Settings (read), Boilerplate, Components | Everything a Salesperson can, plus approve, reject and expire quotes; issue proformas and contracts; sign and cancel; payment schedules; maintenance agreements; delete customers |
| Salesperson | Customer registration, site survey requests, quotation preparation, customer follow-up, contract support, lead conversion | Dashboard, Calculator, Customers, Projects, Quotations, Contracts (read), Assets (read), Settings (read), Boilerplate, Components | Register customers; create projects and move them through survey and calculation; create, price, edit and submit quotations; read proformas and contracts |
| Finance Officer | Access: finance, reporting, invoice modules | Dashboard, Customers, Quotations, Contracts, Invoices, Payments, Receivables, Maintenance (contracts, read), Settings (read), Boilerplate, Components | Invoices, payments, expenses, bank accounts, receivables, statements, instalment invoicing, discount approval |
| Office Manager | Access: employee records, administrative reports, communication system | Dashboard, Employees, Messages, Settings (read) | Staff accounts below management; SMS message log; notifications. Attendance is not built |
| Technical Manager | Installation planning, site supervision, installation reporting, quality control, testing and commissioning | Dashboard, Calculator, Customers, Projects, Quotations, Contracts, Assets, Maintenance, Settings (read), Boilerplate, Components | Quotation lines (specs); create projects and advance installation stages; contract handover; assets; maintenance contracts, visits and breakdowns |
| Maintenance Engineer | Service scheduling, maintenance activities, emergency response, breakdown repair, service reporting | Dashboard, Calculator, Customers (read), Projects (read), Assets, Maintenance, Settings (read) | Maintenance contracts, service visits, breakdown tickets; assets; reads customers and specs |
| Store Keeper | Inventory management, material issuance, stock monitoring, purchase requests, warehouse control | Dashboard, Assets, Settings (read) | The asset register. Inventory, issuance and purchase requests are not built |
| Secretary | Document preparation, correspondence, filing, meeting coordination, reception | Dashboard, Customers, Projects (read), Quotations (read), Contracts (read), Maintenance (breakdowns), Settings (read), Boilerplate, Components | Register customers; open breakdown calls; read and print quotations, proformas and contracts; post notifications |
| System Administrator (`ADMIN`) | — | Everything | Everything, plus settings edit, rates, employees, messages |
| Customer (`CUSTOMER`) | — | Notifications, docs | Nothing yet; the customer portal is not built |

## Rules that hold across modules

- **Staff accounts.** The General Manager and Office Manager may create and
  edit staff, but only roles below management: never CEO, General Manager or
  Admin, and never an existing executive's account (`EmployeesService.assertMayManage`).
- **Settings** are readable by every staff role and editable by CEO and Admin.
- **Dashboard** is open to every staff role; the customer role gets none.
- **Notifications and the in-app docs** are open to every login.

## Not in the document's access rights but granted, with the reason

- Finance Officer reads quotations, proformas and contracts: the invoice and
  the instalment invoicing are raised from them.
- Maintenance Engineer reads customers, projects and quotations: the site,
  the contact and the specification of the lift being serviced.
- Secretary reads and prints the sales documents and opens breakdown calls:
  "document preparation" and "reception activities".

## In the document but not built yet

Marketing campaigns and advertisement management, installation module
(checklists, engineer assignment, progress), inventory and suppliers,
employee attendance, LAN chat and file sharing, the customer portal.
The roles exist so these land under the right seat when built.
