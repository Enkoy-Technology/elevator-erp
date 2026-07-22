import { DomainError } from './domain.error';

export class SlaBreachError extends DomainError {
  readonly status = 422;
  readonly problemType = 'sla-breach';
  readonly title = 'SLA breach';
}
