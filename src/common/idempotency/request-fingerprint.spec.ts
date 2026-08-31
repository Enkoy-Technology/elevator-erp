import { fingerprintRequest } from './request-fingerprint';

describe('fingerprintRequest', () => {
  it('is stable regardless of key order', () => {
    const a = fingerprintRequest('PaymentsController#record', {
      customerId: '1',
      amountEtb: '112.00',
    });
    const b = fingerprintRequest('PaymentsController#record', {
      amountEtb: '112.00',
      customerId: '1',
    });
    expect(a).toBe(b);
  });

  it('changes when the body changes', () => {
    const a = fingerprintRequest('PaymentsController#record', { amountEtb: '112.00' });
    const b = fingerprintRequest('PaymentsController#record', { amountEtb: '113.00' });
    expect(a).not.toBe(b);
  });

  it('changes when the endpoint changes, same body', () => {
    const a = fingerprintRequest('PaymentsController#record', { amountEtb: '112.00' });
    const b = fingerprintRequest('ExpensesController#record', { amountEtb: '112.00' });
    expect(a).not.toBe(b);
  });

  it('treats nested objects/arrays structurally, not just top-level keys', () => {
    const a = fingerprintRequest('PaymentsController#record', {
      allocations: [
        { invoiceId: '1', amountEtb: '10' },
        { invoiceId: '2', amountEtb: '20' },
      ],
    });
    const b = fingerprintRequest('PaymentsController#record', {
      allocations: [
        { amountEtb: '10', invoiceId: '1' },
        { invoiceId: '2', amountEtb: '20' },
      ],
    });
    expect(a).toBe(b);

    // Array ORDER still matters — [10, 20] is a different request than [20, 10].
    const reordered = fingerprintRequest('PaymentsController#record', {
      allocations: [
        { invoiceId: '2', amountEtb: '20' },
        { invoiceId: '1', amountEtb: '10' },
      ],
    });
    expect(a).not.toBe(reordered);
  });

  it('treats a missing body the same as an empty object', () => {
    expect(fingerprintRequest('InvoicesController#voidInvoice', undefined)).toBe(
      fingerprintRequest('InvoicesController#voidInvoice', {}),
    );
  });
});
