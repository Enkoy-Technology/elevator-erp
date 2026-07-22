import { DomainError } from './domain.error';

export class TenantIsolationError extends DomainError {
  readonly status = 403;
  readonly problemType = 'tenant-isolation';
  readonly title = 'Tenant isolation violation';
}
