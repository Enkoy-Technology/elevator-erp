import { DomainError } from './domain.error';

export class WorkflowTransitionError extends DomainError {
  readonly status = 409;
  readonly problemType = 'workflow-transition';
  readonly title = 'Invalid workflow transition';
}
