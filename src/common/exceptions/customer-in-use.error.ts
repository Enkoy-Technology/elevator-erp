import { DomainError } from './domain.error';

export class CustomerInUseError extends DomainError {
  readonly status = 409;
  readonly problemType = 'customer-in-use';
  readonly title = 'Customer in use';

  constructor(projectCount: number, assetCount: number, contractCount: number) {
    super(
      `Cannot delete a customer with ${projectCount} linked project(s), ${assetCount} linked asset(s) and ${contractCount} linked maintenance contract(s).`,
    );
  }
}
