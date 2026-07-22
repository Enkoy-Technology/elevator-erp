# Skill: Create New NestJS Module

Create a complete NestJS feature module following project conventions.

## Parameters
- `moduleName`: PascalCase module name (e.g., `InventoryManagement`)
- `entities`: Array of entity names (e.g., `['Warehouse', 'StockLevel']`)
- `hasCRUD`: boolean — include full REST CRUD endpoints

## Steps
1. Create module directory: `src/modules/{kebab-case(moduleName)}/`
2. Create files:
   - `{moduleName}.module.ts` — module definition with imports/exports
   - `dto/` — CreateDto, UpdateDto, ResponseDto for each entity
   - `entities/` — Drizzle schema definitions
   - `{moduleName}.controller.ts` — REST endpoints with Swagger decorators
   - `{moduleName}.service.ts` — business logic, repository pattern
   - `{moduleName}.service.spec.ts` — unit tests with mocked repository
3. Add composite PK `(tenant_id, id)` to every entity
4. Add RLS policies to every table
5. Add `TenantGuard` to all controller routes
6. Register the module in `AppModule`
7. Add the module to the `AGENTS.md` Architecture section
8. Run `pnpm run typecheck` and `pnpm test`

## Example Invocation
"Run the new-module skill for BreakdownTickets with entities ['BreakdownTicket', 'BreakdownReport'] and hasCRUD=true"
