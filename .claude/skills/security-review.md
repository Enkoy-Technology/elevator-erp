# Skill: Security Review

Perform a security audit on the specified code or module. Pairs with the
`security-auditor` subagent for deep passes.

## Parameters
- `target`: File path, module name, or 'all' for the full codebase
- `focus`: rls | auth | injection | secrets | dependencies

## Checklist
- [ ] RLS policies exist on all tenant-scoped tables
- [ ] Tenant context is set before every DB query (no cross-tenant leakage)
- [ ] No raw SQL concatenation (SQL injection risk)
- [ ] No secrets in code (API keys, passwords, tokens)
- [ ] JWT validation on all protected routes; `TenantGuard` applied
- [ ] Rate limiting on public endpoints (`/public/*`)
- [ ] Input validation with Zod/class-validator on all DTOs
- [ ] No `eval()` or dynamic code execution
- [ ] `pnpm audit --audit-level high` passes
- [ ] CORS configured correctly
- [ ] File upload size + MIME-type validation

## Output
A markdown report: findings, severity (CRITICAL/HIGH/MEDIUM/LOW), and recommended fixes.
