import { DomainError } from './domain.error';

export class CustomerInUseError extends DomainError {
  readonly status = 409;
  readonly problemType = 'customer-in-use';
  readonly title = 'Customer in use';

  constructor(
    projectCount: number,
    assetCount: number,
    contractCount: number,
    invoiceCount: number,
    paymentCount: number,
  ) {
    super(
      `Cannot delete a customer with ${projectCount} linked project(s), ${assetCount} linked asset(s), ${contractCount} linked maintenance contract(s), ${invoiceCount} linked invoice(s) and ${paymentCount} linked payment(s).`,
    );
  }
}
