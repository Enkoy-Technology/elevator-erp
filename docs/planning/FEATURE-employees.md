# FEATURE: Employees & roles

## Goal
Simple staff directory so Shining Star can add employees and assign roles that already gate the API.

## In scope
- List employees (paginated, search by name/email)
- Create employee with email, temporary password, and role
- Update name, phone, role, active flag
- Exclude `CUSTOMER` accounts from this list

## Out of scope (later)
- Password reset emails
- Project owner assignment UI (fields already on projects)
- Fine-grained permission editor

## Roles (staff)
CEO, Sales Manager, Technical Lead, Field Engineer, Finance, Warehouse Manager, Dispatcher, Admin

## API
- `GET /v1/employees` — CEO/ADMIN
- `POST /v1/employees` — CEO/ADMIN
- `PATCH /v1/employees/:id` — CEO/ADMIN

## UI
`/employees` — table + right-side drawer for add/edit

## Exit criteria
- [x] Admin can add a sales manager and see them in the list
- [x] Role change persists
- [x] Password hash never returned in responses
