import { Decimal } from 'decimal.js';

import type { ColumnDef } from '../../common/export/tabular';
import { vatPercentLabel } from '../../common/export/templates/money-format';
import {
  buildFiscalStatusText,
  type InvoiceTemplateData,
} from '../../common/export/templates/invoice.template';

/**
 * The fields invoiceDocumentData/INVOICE_DOCUMENT_COLUMNS actually read —
 * narrower than InvoiceRecord (which InvoicesRepository.findByIdForDocument's
 * joined row structurally satisfies, plus customerName/projectName/lines).
 * Kept narrow so this type doubles as the minimal fixture shape a test
 * needs — same pattern as ProformaDocumentRow.
 */
export interface InvoiceDocumentLineRow {
  description: string;
  quantity: string;
  unitPriceEtb: string;
  lineTotalEtb: string;
}

export interface InvoiceDocumentRow {
  invoiceNumber: string;
  status: string;
  issuedAt: Date;
  dueDate: string | null;
  customerName: string | null;
  projectName: string | null;
  lines: InvoiceDocumentLineRow[];
  subtotalEtb: string;
  vatEtb: string;
  totalEtb: string;
  whtEtb: string;
  whtVoucherRef: string | null;
  fiscalReceiptNumber: string | null;
  fiscalDeviceSerial: string | null;
  fiscalIssuedAt: Date | null;
  fiscalKind: string | null;
  fiscalNote: string | null;
}

/**
 * Maps an invoice row to the data shape both DocumentPdfService and
 * DocumentDocxService consume for the 'invoice' template. Money fields pass
 * through as raw decimal strings via formatEtb inside the templates, except
 * the withholding-derived fields (hasWithholding/whtDeductionEtb/
 * netCashDueEtb) — computed here with decimal.js so the templates stay pure
 * string formatting (see invoice.template.ts's own doc comment).
 */
export const invoiceDocumentData = (row: InvoiceDocumentRow): InvoiceTemplateData => {
  const wht = new Decimal(row.whtEtb);
  const hasWithholding = wht.gt(0);

  return {
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    issuedAt: row.issuedAt,
    dueDate: row.dueDate,
    customerName: row.customerName ?? '',
    projectName: row.projectName,
    lines: row.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceEtb: l.unitPriceEtb,
      lineTotalEtb: l.lineTotalEtb,
    })),
    subtotalEtb: row.subtotalEtb,
    taxPercent: vatPercentLabel(row.subtotalEtb, row.vatEtb),
    vatEtb: row.vatEtb,
    totalEtb: row.totalEtb,
    hasWithholding,
    whtVoucherRef: row.whtVoucherRef,
    whtDeductionEtb: wht.negated().toFixed(2),
    netCashDueEtb: new Decimal(row.totalEtb).minus(wht).toFixed(2),
    fiscalReceiptNumber: row.fiscalReceiptNumber,
    fiscalDeviceSerial: row.fiscalDeviceSerial,
    fiscalIssuedAt: row.fiscalIssuedAt,
    fiscalKind: row.fiscalKind,
    fiscalNote: row.fiscalNote,
  };
};

/**
 * Columns for the single-invoice xlsx download — line items are not
 * flattened into this summary row (see the task-5 report). Leading
 * "Document Status" column carries the R6 fiscal notice/mirror text (see
 * `withDocumentStatus` below and invoice.template.ts's own compliance
 * comment) — the PDF/DOCX formats already show it prominently; xlsx must
 * too, since it's the format most likely handed to an accountant as "the
 * invoice".
 */
export const INVOICE_DOCUMENT_COLUMNS: ColumnDef[] = [
  { key: 'documentStatus', header: 'Document Status' },
  { key: 'invoiceNumber', header: 'Invoice Number' },
  { key: 'status', header: 'Status' },
  { key: 'customerName', header: 'Customer' },
  { key: 'projectName', header: 'Project' },
  { key: 'issuedAt', header: 'Issued At', format: 'date' },
  { key: 'dueDate', header: 'Due Date', format: 'date' },
  { key: 'subtotalEtb', header: 'Subtotal (ETB)', format: 'money' },
  { key: 'vatEtb', header: 'VAT (ETB)', format: 'money' },
  { key: 'whtEtb', header: 'Withholding (ETB)', format: 'money' },
  { key: 'totalEtb', header: 'Total (ETB)', format: 'money' },
  { key: 'fiscalReceiptNumber', header: 'Fiscal Receipt Number' },
];

/**
 * R6: stamps the plain-text fiscal notice/mirror onto the raw document row
 * for the xlsx export ONLY — the PDF/DOCX path renders it via
 * `invoiceDocumentData` + `buildFiscalStatusHtml` inside the HTML template
 * instead, so this must never be folded into `invoiceDocumentData` itself.
 */
export const withDocumentStatus = (
  row: InvoiceDocumentRow,
): InvoiceDocumentRow & { documentStatus: string } => ({
  ...row,
  documentStatus: buildFiscalStatusText(row),
});
