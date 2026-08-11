import { Decimal } from 'decimal.js';

import type { ReceiptTemplateData } from '../../common/export/templates/receipt.template';

/**
 * The fields receiptDocumentData actually reads — narrower than
 * PaymentRecord (which PaymentsRepository.findByIdForDocument's joined row
 * structurally satisfies, plus customerName/allocations/
 * originalReceiptNumber). Kept narrow so this type doubles as the minimal
 * fixture shape a test needs — same pattern as InvoiceDocumentRow.
 *
 * No xlsx column export here — the brief is explicit that a receipt is not
 * a table (PaymentsController.document offers only pdf/docx).
 */
export interface ReceiptDocumentAllocationRow {
  invoiceNumber: string | null;
  amountEtb: string;
}

export interface PaymentDocumentRow {
  receiptNumber: string;
  receivedAt: Date;
  customerName: string | null;
  amountEtb: string;
  method: string;
  reference: string | null;
  allocations: ReceiptDocumentAllocationRow[];
  originalReceiptNumber: string | null;
}

/**
 * Maps a payment row to the data shape both DocumentPdfService and
 * DocumentDocxService consume for the 'receipt' template. `hasOnAccount`/
 * `onAccountEtb` (amountEtb minus Σ allocations) are computed here with
 * decimal.js so receipt.template.ts stays pure string formatting — same
 * reasoning as invoiceDocumentData's hasWithholding/netCashDueEtb.
 */
export const receiptDocumentData = (row: PaymentDocumentRow): ReceiptTemplateData => {
  const allocatedTotal = row.allocations.reduce(
    (sum, a) => sum.plus(a.amountEtb),
    new Decimal(0),
  );
  const onAccountEtb = new Decimal(row.amountEtb).minus(allocatedTotal).toFixed(2);

  return {
    receiptNumber: row.receiptNumber,
    receivedAt: row.receivedAt,
    customerName: row.customerName ?? '',
    amountEtb: row.amountEtb,
    method: row.method,
    reference: row.reference,
    allocations: row.allocations.map((a) => ({
      invoiceNumber: a.invoiceNumber ?? '—',
      amountEtb: a.amountEtb,
    })),
    hasOnAccount: !new Decimal(onAccountEtb).isZero(),
    onAccountEtb,
    originalReceiptNumber: row.originalReceiptNumber,
  };
};
