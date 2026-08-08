import { DomainError } from './domain.error';

export class LastAdminError extends DomainError {
  readonly status = 409;
  readonly problemType = 'last-admin';
  readonly title = 'Last administrator';

  constructor() {
    super(
      'Cannot deactivate or demote the last active administrator of this tenant.',
    );
  }
}
