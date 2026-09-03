'use client';

import Link from 'next/link';
import { updatedColumn } from '@/components/updated-column';
import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { Ban, Undo2 } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  fieldClass,
  labelClass,
  metaLabelClass,
} from '@/components/form-styles';
import {
  FilterSelect,
  ListToolbar,
  RowAction,
  SearchField,
  StatusPill,
} from '@/components/list-toolbar';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import { formatEtb, isPositiveEtb, isZeroEtb, subtractEtb, sumEtb } from '@/lib/money';
import {
  getCustomer,
  ApiError,
  allocatePayment,
  downloadInvoiceDocument,
  printInvoiceDocument,
  printReceiptDocument,
  downloadPayments,
  downloadReceiptDocument,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  listInvoices,
  listPayments,
  optional,
  recordInvoiceWithholding,
  reversePayment,
  voidInvoice,
  type Customer,
  type DocumentFormat,
  type Invoice,
  type InvoiceListRow,
  type InvoiceStatus,
  type PaymentExportFormat,
  type PaymentListRow,
  type PaymentMethod,
  type UserRole,
} from '@/lib/api';

type Tab = 'invoices' | 'payments';

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOID: 'Void',
};

/** One tone vocabulary for the whole ERP — StatusPill owns the colours. */
const INVOICE_STATUS_TONE = {
  ISSUED: 'warn',
  PARTIALLY_PAID: 'active',
  PAID: 'good',
  VOID: 'neutral',
} as const satisfies Record<InvoiceStatus, string>;

const INVOICE_FILTERS: readonly InvoiceStatus[] = [
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
];

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CBE_BIRR: 'CBE Birr',
  TELEBIRR: 'Telebirr',
  OTHER: 'Other',
};

const PAYMENT_METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(
  (value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }),
);

/**
 * Print stays its own button (it is the action people actually reach for);
 * the file formats collapse into one control so a row is not seven buttons
 * wide. A native <select> on purpose: a CSS dropdown inside the table's
 * overflow container would be clipped on the last rows, and the native
 * picker is keyboard- and screen-reader-correct for free.
 */
const DownloadSelect = <T extends string>({
  formats,
  disabled,
  onPick,
  label,
}: {
  formats: readonly T[];
  disabled: boolean;
  onPick: (format: T) => void;
  label: string;
}) => (
  <select
    aria-label={label}
    disabled={disabled}
    value=""
    onChange={(event) => {
      const format = event.target.value;
      if (format) {
        onPick(format as T);
      }
    }}
    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <option value="">Download…</option>
    {formats.map((format) => (
      <option key={format} value={format}>
        {format.toUpperCase()}
      </option>
    ))}
  </select>
);

/** A date bound in the toolbar, labelled the same way FilterSelect is. */
const DateFilter = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <div className="min-w-[9.5rem]">
      <label htmlFor={id} className={`mb-1 block font-semibold ${metaLabelClass}`}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};

/**
 * "Export selected" — a CSV of exactly the rows that are ticked, built from
 * the page's already-loaded data. There is no "give me these ids" endpoint,
 * and re-fetching rows the browser is already holding to produce them would
 * be work for nothing. The toolbar's CSV/XLSX buttons are a different thing:
 * those export the whole filtered set, server-side.
 *
 * ponytail: duplicated in the other list pages rather than lifted into
 * @/lib/csv, because those files are being edited concurrently. Lift it into
 * one module once they have landed.
 */
const downloadCsv = (
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void => {
  // Quote every cell, and neutralise a leading =/+/-/@ so that a crafted
  // value (a customer name, a void reason) opens as text in a spreadsheet
  // rather than as a formula.
  const cell = (value: string): string =>
    `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // BOM: Excel needs it to read UTF-8 (Amharic names) instead of mojibake.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Invoices a payment can still be allocated against. */
const OPEN_STATUSES = new Set<InvoiceStatus>(['ISSUED', 'PARTIALLY_PAID']);

/** Mirrors InvoicesController/PaymentsController's class-level
 *  @Roles('FINANCE') (no per-route override on any mutation route);
 *  CEO/ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canManageFinance = (role: UserRole | null): boolean =>
  role === 'FINANCE' || role === 'CEO' || role === 'ADMIN';

/**
 * The list's Outstanding column — GET /invoices now returns an exact,
 * server-computed `outstandingEtb` (totalEtb − whtEtb − allocatedEtb, see
 * InvoicesRepository.withOutstanding) for every row and every status, so
 * this is a straight display, never a client-side re-derivation.
 */
function outstandingDisplay(invoice: InvoiceListRow): string {
  return formatEtb(invoice.outstandingEtb);
}

interface AllocationDraft {
  invoiceId: string;
  invoiceNumber: string;
  /** Exact remaining room on this invoice — server-computed outstandingEtb. */
  maxEtb: string;
  amountEtb: string;
}

function toAllocationDrafts(invoices: InvoiceListRow[]): AllocationDraft[] {
  return invoices.map((invoice) => ({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    maxEtb: invoice.outstandingEtb,
    amountEtb: '',
  }));
}

export default function InvoicesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('invoices');
  const [role, setRole] = useState<UserRole | null>(null);
  /**
   * The URL can only be read in an effect (so the server and first client
   * render match), and it carries `?tab=` and `?customerId=` — the latter is
   * how "View all" from a customer's page arrives. Both lists hold off their
   * first load until it has been read, so a deep link never shows every
   * invoice for a moment before narrowing to one customer's.
   */
  const [urlRead, setUrlRead] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});

  // --- Payments tab: paginated from GET /payments (persists across reloads,
  // unlike the earlier session-local placeholder). ---
  const [payments, setPayments] = useState<PaymentListRow[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(0);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsCustomerFilter, setPaymentsCustomerFilter] = useState('');
  const [paymentsMethodFilter, setPaymentsMethodFilter] = useState<PaymentMethod | ''>('');
  const [paymentsFrom, setPaymentsFrom] = useState('');
  const [paymentsTo, setPaymentsTo] = useState('');
  const [paymentsQInput, setPaymentsQInput] = useState('');
  const [paymentsQ, setPaymentsQ] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bulk selection, one set per tab. Cleared whenever the rows underneath it
  // change (see refresh/refreshPayments) — an id whose row is no longer
  // loaded cannot be exported, so keeping it would silently drop it.
  const [selectedInvoices, setSelectedInvoices] = useState<ReadonlySet<string>>(new Set());
  const [selectedPayments, setSelectedPayments] = useState<ReadonlySet<string>>(new Set());

  // --- Withholding drawer ---
  const [withholdTarget, setWithholdTarget] = useState<Invoice | null>(null);
  const [withholdAmount, setWithholdAmount] = useState('');
  const [withholdVoucher, setWithholdVoucher] = useState('');
  const [withholdError, setWithholdError] = useState<string | null>(null);
  const [withholdSubmitting, setWithholdSubmitting] = useState(false);

  // --- Allocate (existing payment) drawer ---
  const [allocateTarget, setAllocateTarget] = useState<PaymentListRow | null>(null);
  const [allocateDrafts, setAllocateDrafts] = useState<AllocationDraft[]>([]);
  const [allocateError, setAllocateError] = useState<string | null>(null);
  const [allocateSubmitting, setAllocateSubmitting] = useState(false);
  const allocateTargetRef = useRef<PaymentListRow | null>(null);

  const refresh = useCallback(
    async (
      nextPage: number,
      status: InvoiceStatus | '',
      customerId: string,
      query: string,
      size: number,
    ) => {
      setLoading(true);
      setError(null);
      setSelectedInvoices(new Set());
      try {
        const [customerPage, result] = await Promise.all([
          optional(listCustomers({ page: 1, pageSize: 100 })),
          listInvoices({
            status: status || undefined,
            customerId: customerId || undefined,
            q: query || undefined,
            page: nextPage,
            pageSize: size,
          }),
        ]);
        // A deep link from a customer page (?customerId=…) can name someone
        // outside this first page of options. Without them in the list the
        // <select> falls back to showing "All customers" while the table is
        // genuinely filtered — the filter is invisible and looks like a bug.
        const options = customerPage.items;
        if (customerId && !options.some((c) => c.id === customerId)) {
          // A failure here must not take the page down: the filter still
          // works, the dropdown just cannot name them.
          const named = await getCustomer(customerId).catch(() => null);
          if (named) {
            options.unshift(named);
          }
        }
        setCustomers(options);
        setCustomerMap(
          Object.fromEntries(customerPage.items.map((c) => [c.id, c.name] as const)),
        );
        setInvoices(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshPayments = useCallback(
    async (
      nextPage: number,
      customerId: string,
      method: PaymentMethod | '',
      from: string,
      to: string,
      query: string,
      size: number,
    ) => {
      setPaymentsLoading(true);
      setError(null);
      setSelectedPayments(new Set());
      try {
        const result = await listPayments({
          customerId: customerId || undefined,
          method: method || undefined,
          from: from || undefined,
          to: to || undefined,
          q: query || undefined,
          page: nextPage,
          pageSize: size,
        });
        setPayments(result.items);
        setPaymentsPage(result.page);
        setPaymentsTotal(result.total);
        setPaymentsTotalPages(result.totalPages);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load payments');
      } finally {
        setPaymentsLoading(false);
      }
    },
    [],
  );

  /** Both tabs' data after a payment-moving action (record/allocate/reverse) — a payment mutation can change an invoice's status/outstanding AND the payments list in the same step. */
  const refreshAfterPaymentMutation = useCallback(
    () =>
      Promise.all([
        refresh(page, statusFilter, customerFilter, q, pageSize),
        refreshPayments(
          paymentsPage,
          paymentsCustomerFilter,
          paymentsMethodFilter,
          paymentsFrom,
          paymentsTo,
          paymentsQ,
          paymentsPageSize,
        ),
      ]),
    [
      refresh,
      page,
      statusFilter,
      customerFilter,
      q,
      pageSize,
      refreshPayments,
      paymentsPage,
      paymentsCustomerFilter,
      paymentsMethodFilter,
      paymentsFrom,
      paymentsTo,
      paymentsQ,
      paymentsPageSize,
    ],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'payments') {
      setTab('payments');
    }
    const customerId = params.get('customerId');
    if (customerId) {
      // Both tabs, so switching between them keeps the same customer.
      setCustomerFilter(customerId);
      setPaymentsCustomerFilter(customerId);
    }
    setUrlRead(true);
  }, [router]);

  useEffect(() => {
    if (!urlRead) {
      return;
    }
    void refresh(page, statusFilter, customerFilter, q, pageSize);
  }, [urlRead, refresh, page, statusFilter, customerFilter, q, pageSize]);

  useEffect(() => {
    if (!urlRead) {
      return;
    }
    void refreshPayments(
      paymentsPage,
      paymentsCustomerFilter,
      paymentsMethodFilter,
      paymentsFrom,
      paymentsTo,
      paymentsQ,
      paymentsPageSize,
    );
  }, [
    urlRead,
    refreshPayments,
    paymentsPage,
    paymentsCustomerFilter,
    paymentsMethodFilter,
    paymentsFrom,
    paymentsTo,
    paymentsQ,
    paymentsPageSize,
  ]);

  // A payment is "already reversed" when some OTHER row on the currently
  // loaded page points back at it via reversalOfPaymentId — derived from
  // the server-backed list itself rather than a session-tracked Set, so it
  // reflects reversals from any session, not just this browser tab's own
  // actions. ponytail: only catches pairs that land on the SAME page (both
  // sorted by createdAt desc); the server's own double-reversal guard
  // (PaymentsRepository.reverse) is the real authority regardless — add a
  // dedicated `isReversed` flag from the API if a false-enabled Reverse
  // button in a stale/far page ever turns out to matter in practice.
  const reversedIds = useMemo(
    () =>
      new Set(
        payments
          .filter((p): p is PaymentListRow & { reversalOfPaymentId: string } =>
            p.reversalOfPaymentId !== null,
          )
          .map((p) => p.reversalOfPaymentId),
      ),
    [payments],
  );

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    router.replace(next === 'payments' ? '/invoices?tab=payments' : '/invoices', {
      scroll: false,
    });
  };

  const setStatus = (next: InvoiceStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const setCustomer = (next: string) => {
    setPage(1);
    setCustomerFilter(next);
  };

  // SearchField's clear affordance calls onChange('') and onSubmit() in the
  // same tick, so reading `qInput` in the submit handler would search the
  // pre-clear value. The ref is what the submit actually reads.
  const runSearch = (term: string) => {
    setPage(1);
    setQ(term.trim());
  };

  const setPaymentsCustomer = (next: string) => {
    setPaymentsPage(1);
    setPaymentsCustomerFilter(next);
  };

  const setPaymentsMethodFilterAndReset = (next: PaymentMethod | '') => {
    setPaymentsPage(1);
    setPaymentsMethodFilter(next);
  };

  const setPaymentsFromDate = (next: string) => {
    setPaymentsPage(1);
    setPaymentsFrom(next);
  };

  const setPaymentsToDate = (next: string) => {
    setPaymentsPage(1);
    setPaymentsTo(next);
  };

  const runPaymentsSearch = (term: string) => {
    setPaymentsPage(1);
    setPaymentsQ(term.trim());
  };

  const onDownloadPayments = async (format: PaymentExportFormat) => {
    setError(null);
    try {
      await downloadPayments(format, {
        customerId: paymentsCustomerFilter || undefined,
        method: paymentsMethodFilter || undefined,
        from: paymentsFrom || undefined,
        to: paymentsTo || undefined,
        q: paymentsQ || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    }
  };

  const canWrite = canManageFinance(role);

  /**
   * "Pay this invoice in full" prefill for the record-payment route. It rides
   * in the URL rather than in-memory state so the form survives a reload and
   * a shared link, which the old drawer's ref could not.
   */
  const paymentHrefForInvoice = (invoice: InvoiceListRow): string =>
    `/invoices/payments/new?${new URLSearchParams({
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      // Exact for both ISSUED and PARTIALLY_PAID — outstandingEtb is
      // server-computed for every status.
      amountEtb: invoice.outstandingEtb,
    }).toString()}`;

  // ---- Void ----

  const onVoid = async (invoice: Invoice) => {
    const entered = window.prompt(`Reason for voiding ${invoice.invoiceNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Void reason must be at least 2 characters');
      return;
    }
    setBusyId(invoice.id);
    setError(null);
    try {
      await voidInvoice(invoice.id, reason);
      await refresh(page, statusFilter, customerFilter, q, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to void invoice');
    } finally {
      setBusyId(null);
    }
  };

  // ---- Record withholding ----

  const openWithhold = (invoice: Invoice) => {
    setWithholdTarget(invoice);
    // WithholdingDto is an ABSOLUTE SET, not cumulative (recordWithholding's
    // own doc comment) — re-posting replaces whatever's already recorded.
    // Prefill from the invoice's current values so correcting an existing
    // withholding is a deliberate edit, not a blind overwrite.
    setWithholdAmount(isZeroEtb(invoice.whtEtb) ? '' : invoice.whtEtb);
    setWithholdVoucher(invoice.whtVoucherRef ?? '');
    setWithholdError(null);
  };

  const closeWithhold = () => {
    setWithholdTarget(null);
    setWithholdError(null);
  };

  const onWithhold = async (event: FormEvent) => {
    event.preventDefault();
    if (!withholdTarget) {
      return;
    }
    setWithholdSubmitting(true);
    setWithholdError(null);
    try {
      await recordInvoiceWithholding(withholdTarget.id, {
        amountEtb: withholdAmount,
        voucherRef: withholdVoucher || undefined,
      });
      closeWithhold();
      await refresh(page, statusFilter, customerFilter, q, pageSize);
    } catch (err) {
      setWithholdError(
        err instanceof ApiError ? err.message : 'Failed to record withholding',
      );
    } finally {
      setWithholdSubmitting(false);
    }
  };

  // ---- Allocate an existing payment ----

  const openAllocate = (payment: PaymentListRow) => {
    setAllocateTarget(payment);
    allocateTargetRef.current = payment;
    setAllocateError(null);
    void (async () => {
      const result = await optional(
        listInvoices({ customerId: payment.customerId, pageSize: 100 }),
      );
      // Guard against a stale response: if the user closed this drawer or
      // opened it for a different payment before this fetch resolved, drop
      // it rather than overwrite whatever's showing now.
      if (allocateTargetRef.current?.id !== payment.id) {
        return;
      }
      // ponytail: unlike the earlier session-only PaymentWithAllocations,
      // a PaymentListRow carries only the aggregate allocatedEtb, not which
      // specific invoices it already touched — GET /payments/:id doesn't
      // exist to fetch that detail, so this no longer excludes invoices
      // already allocated to this payment from the picker. Submitting a
      // duplicate one 409s with a clear message (PaymentsRepository's own
      // unique-constraint guard) rather than silently double-allocating.
      // Add a payment-detail endpoint if that duplicate-row nuisance turns
      // out to matter in practice.
      const open = result.items.filter((i) => OPEN_STATUSES.has(i.status));
      setAllocateDrafts(toAllocationDrafts(open));
    })();
  };

  const closeAllocate = () => {
    setAllocateTarget(null);
    allocateTargetRef.current = null;
    setAllocateDrafts([]);
    setAllocateError(null);
  };

  const setAllocateDraftAmount = (invoiceId: string, amountEtb: string) => {
    setAllocateDrafts((prev) =>
      prev.map((a) => (a.invoiceId === invoiceId ? { ...a, amountEtb } : a)),
    );
  };

  const onSubmitAllocate = async (event: FormEvent) => {
    event.preventDefault();
    if (!allocateTarget) {
      return;
    }
    setAllocateError(null);
    const entered = allocateDrafts.filter((a) => isPositiveEtb(a.amountEtb || '0'));
    if (entered.length === 0) {
      setAllocateError('Enter an amount for at least one invoice.');
      return;
    }
    const remaining = subtractEtb(allocateTarget.amountEtb, allocateTarget.allocatedEtb);
    const enteredTotal = sumEtb(entered.map((a) => a.amountEtb));
    if (isPositiveEtb(subtractEtb(enteredTotal, remaining))) {
      setAllocateError(
        `Allocating ${formatEtb(enteredTotal)} would exceed this payment's remaining ${formatEtb(remaining)}.`,
      );
      return;
    }
    setAllocateSubmitting(true);
    try {
      // Sequential, not Promise.all: each call is its own transaction, and
      // stopping on the first failure (rather than firing all and sorting
      // out partial success) keeps the error message attributable to one
      // row. Each success is applied to allocateTarget's running
      // allocatedEtb immediately (not batched after the loop) so a failure
      // partway through leaves the drawer's own "remaining" figure in sync
      // with what the server actually committed — a retry then only
      // resubmits what's still pending instead of re-hitting the unique
      // (paymentId, invoiceId) constraint on a row that already succeeded.
      for (const draft of entered) {
        const allocation = await allocatePayment(allocateTarget.id, {
          invoiceId: draft.invoiceId,
          amountEtb: draft.amountEtb,
        });
        setAllocateTarget((prev) =>
          prev
            ? { ...prev, allocatedEtb: sumEtb([prev.allocatedEtb, allocation.amountEtb]) }
            : prev,
        );
        setAllocateDrafts((prev) =>
          prev.map((a) => (a.invoiceId === draft.invoiceId ? { ...a, amountEtb: '' } : a)),
        );
      }
      closeAllocate();
      await refreshAfterPaymentMutation();
    } catch (err) {
      setAllocateError(err instanceof ApiError ? err.message : 'Failed to allocate payment');
    } finally {
      setAllocateSubmitting(false);
    }
  };

  // ---- Reverse a payment ----

  const onReverse = async (payment: PaymentListRow) => {
    const entered = window.prompt(`Reason for reversing receipt ${payment.receiptNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Reversal reason must be at least 2 characters');
      return;
    }
    setBusyId(payment.id);
    setError(null);
    try {
      await reversePayment(payment.id, reason);
      await refreshAfterPaymentMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reverse payment');
    } finally {
      setBusyId(null);
    }
  };

  // ---- Downloads ----

  const onDownloadInvoice = async (invoice: Invoice, format: DocumentFormat) => {
    setBusyId(invoice.id);
    setError(null);
    try {
      await downloadInvoiceDocument(invoice.id, invoice.invoiceNumber, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDownloadReceipt = async (payment: PaymentListRow, format: 'pdf' | 'docx') => {
    setBusyId(payment.id);
    setError(null);
    try {
      await downloadReceiptDocument(payment.id, payment.receiptNumber, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onPrintInvoice = async (invoice: Invoice) => {
    setBusyId(invoice.id);
    setError(null);
    try {
      await printInvoiceDocument(invoice.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  const onPrintReceipt = async (payment: PaymentListRow) => {
    setBusyId(payment.id);
    setError(null);
    try {
      await printReceiptDocument(payment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  // Money goes out as the raw decimal string, not formatEtb's display form —
  // a spreadsheet has to be able to sum the column.
  const exportSelectedInvoices = () => {
    const rows = invoices.filter((invoice) => selectedInvoices.has(invoice.id));
    downloadCsv(
      'invoices.csv',
      ['Number', 'Customer', 'Issued', 'Due', 'Total ETB', 'Withheld ETB', 'Outstanding ETB', 'Status'],
      rows.map((invoice) => [
        invoice.invoiceNumber,
        customerMap[invoice.customerId] ?? invoice.customerId,
        invoice.issuedAt.slice(0, 10),
        invoice.dueDate ?? '',
        invoice.totalEtb,
        invoice.whtEtb,
        invoice.outstandingEtb,
        INVOICE_STATUS_LABEL[invoice.status],
      ]),
    );
  };

  const exportSelectedPayments = () => {
    const rows = payments.filter((payment) => selectedPayments.has(payment.id));
    downloadCsv(
      'payments.csv',
      ['Receipt', 'Customer', 'Received', 'Method', 'Amount ETB', 'Allocated ETB', 'Unallocated ETB', 'Reversal'],
      rows.map((payment) => [
        payment.receiptNumber,
        payment.customerName ?? payment.customerId,
        payment.receivedAt.slice(0, 10),
        PAYMENT_METHOD_LABEL[payment.method],
        payment.amountEtb,
        payment.allocatedEtb,
        subtractEtb(payment.amountEtb, payment.allocatedEtb),
        payment.reversalOfPaymentId ? 'Yes' : 'No',
      ]),
    );
  };

  const renderInvoiceActions = (invoice: InvoiceListRow) => {
    const busy = busyId === invoice.id;
    const canVoid = invoice.status === 'ISSUED' && isZeroEtb(invoice.whtEtb);
    const canPay = OPEN_STATUSES.has(invoice.status);
    const canWithhold = invoice.status !== 'VOID';
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canWrite && canPay ? (
          <Link
            href={paymentHrefForInvoice(invoice)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Record payment
          </Link>
        ) : null}
        {canWrite && canWithhold ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => openWithhold(invoice)}
            className={`${btnSecondary} px-2.5 py-1 text-xs`}
          >
            Withholding
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPrintInvoice(invoice)}
          title="Print the PDF"
          className={`${btnSecondary} px-2.5 py-1 text-xs`}
        >
          Print
        </button>
        <DownloadSelect
          formats={['pdf', 'docx', 'xlsx'] as const}
          disabled={busy}
          onPick={(format) => void onDownloadInvoice(invoice, format)}
          label={`Download ${invoice.invoiceNumber}`}
        />
        {/* Void is an invoice's destructive equivalent — the ledger is
            append-only, so an invoice is never deleted. Its mandatory reason
            prompt is the confirmation step; a second confirm on top would
            just be a click to dismiss. */}
        {canWrite && canVoid ? (
          <RowAction
            icon={Ban}
            tone="danger"
            disabled={busy}
            label={`Void ${invoice.invoiceNumber}`}
            onClick={() => void onVoid(invoice)}
          />
        ) : null}
      </div>
    );
  };

  const renderPaymentActions = (payment: PaymentListRow) => {
    const busy = busyId === payment.id;
    const unallocated = subtractEtb(payment.amountEtb, payment.allocatedEtb);
    // reversedIds also gates Allocate, not just Reverse: reversing doesn't
    // change the ORIGINAL payment's own allocatedEtb (the reversal mirrors
    // its allocations under the reversal's OWN payment id, not the
    // original's — see PaymentsRepository.reverse), so `unallocated` above
    // stays at its pre-reversal value — without this check the button would
    // still show room that reversal was meant to take back, and the server
    // has no reversal-aware guard of its own to catch it
    // (guardAndInsertAllocation only checks the sum invariants).
    const canAllocate =
      isPositiveEtb(payment.amountEtb) &&
      isPositiveEtb(unallocated) &&
      !reversedIds.has(payment.id);
    const canReverse = !payment.reversalOfPaymentId && !reversedIds.has(payment.id);
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canWrite && canAllocate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => openAllocate(payment)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Allocate
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPrintReceipt(payment)}
          title="Print the PDF"
          className={`${btnSecondary} px-2.5 py-1 text-xs`}
        >
          Print
        </button>
        <DownloadSelect
          formats={['pdf', 'docx'] as const}
          disabled={busy}
          onPick={(format) => void onDownloadReceipt(payment, format)}
          label={`Download receipt ${payment.receiptNumber}`}
        />
        {/* Reverse is a payment's destructive equivalent — it posts a mirror
            entry rather than deleting anything. Its mandatory reason prompt
            is the confirmation step. */}
        {canWrite && canReverse ? (
          <RowAction
            icon={Undo2}
            tone="danger"
            disabled={busy}
            label={`Reverse receipt ${payment.receiptNumber}`}
            onClick={() => void onReverse(payment)}
          />
        ) : null}
      </div>
    );
  };

  const invoiceColumns: ColumnDef<InvoiceListRow, unknown>[] = [
    {
      accessorKey: 'invoiceNumber',
      header: 'Number',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-900">{row.original.invoiceNumber}</span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      enableSorting: true,
      accessorFn: (row) => customerMap[row.customerId] ?? row.customerId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'issued',
      header: 'Issued',
      cell: ({ row }) => row.original.issuedAt.slice(0, 10),
    },
    {
      id: 'due',
      header: 'Due',
      cell: ({ row }) => row.original.dueDate ?? '—',
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-semibold text-navy-800">{formatEtb(row.original.totalEtb)}</span>
      ),
    },
    {
      id: 'outstanding',
      header: 'Outstanding',
      meta: { align: 'right' },
      cell: ({ row }) => outstandingDisplay(row.original),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={INVOICE_STATUS_LABEL[row.original.status]}
          tone={INVOICE_STATUS_TONE[row.original.status]}
        />
      ),
    },
    updatedColumn<InvoiceListRow>((row) => row.updatedAt),
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderInvoiceActions(row.original),
    },
  ];

  const paymentColumns: ColumnDef<PaymentListRow, unknown>[] = [
    {
      accessorKey: 'receiptNumber',
      header: 'Receipt',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-slate-900">{row.original.receiptNumber}</span>
          {row.original.reversalOfPaymentId ? <StatusPill label="Reversal" /> : null}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      enableSorting: true,
      accessorFn: (row) => row.customerName ?? row.customerId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'received',
      header: 'Received',
      cell: ({ row }) => row.original.receivedAt.slice(0, 10),
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method],
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-semibold text-navy-800">{formatEtb(row.original.amountEtb)}</span>
      ),
    },
    {
      id: 'allocated',
      header: 'Allocated',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.allocatedEtb),
    },
    {
      id: 'unallocated',
      header: 'Unallocated',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(subtractEtb(row.original.amountEtb, row.original.allocatedEtb)),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderPaymentActions(row.original),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Invoices</h1>
              <p className="text-sm text-slate-500">
                Issue → collect (amounts in ETB)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/receivables" className={btnGhost}>
                Receivables
              </Link>
              {canWrite && tab === 'payments' ? (
                <Link href="/invoices/payments/new" className={btnPrimary}>
                  Record payment
                </Link>
              ) : null}
              {canWrite && tab === 'invoices' ? (
                <>
                  <Link href="/invoices/payments/new" className={btnSecondary}>
                    Record payment
                  </Link>
                  <Link href="/invoices/new" className={btnPrimary}>
                    Create invoice
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => switchTab('invoices')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'invoices'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Invoices
            </button>
            <button
              type="button"
              onClick={() => switchTab('payments')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'payments'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Payments
            </button>
          </div>

          <section>
            {tab === 'invoices' ? (
              <>
                <ListToolbar
                  search={
                    <SearchField
                      value={qInput}
                      onChange={setQInput}
                      onSubmit={runSearch}
                      placeholder="Invoice number"
                    />
                  }
                  filters={
                    <>
                      <FilterSelect
                        label="Status"
                        value={statusFilter}
                        onChange={setStatus}
                        options={INVOICE_FILTERS.map((s) => ({
                          value: s,
                          label: INVOICE_STATUS_LABEL[s],
                        }))}
                        allLabel="All statuses"
                      />
                      <FilterSelect
                        label="Customer"
                        value={customerFilter}
                        onChange={setCustomer}
                        options={customers.map((c) => ({ value: c.id, label: c.name }))}
                        allLabel="All customers"
                      />
                    </>
                  }
                />
                <DataTable
                  columns={invoiceColumns}
                  rows={invoices}
                  getRowId={(invoice) => invoice.id}
                  getRowLabel={(invoice) => invoice.invoiceNumber}
                  selectable
                  selectedIds={selectedInvoices}
                  onSelectionChange={setSelectedInvoices}
                  // Export only. Voiding five invoices from a checkbox is not
                  // something this product should make easy — a void carries a
                  // mandatory per-invoice reason, one at a time, on purpose.
                  bulkActions={
                    <button
                      type="button"
                      onClick={exportSelectedInvoices}
                      className={`${btnSecondary} px-2.5 py-1 text-xs`}
                    >
                      Export selected
                    </button>
                  }
                  loading={loading}
                  caption="Invoices"
                  pagination={{
                    page,
                    pageSize,
                    total,
                    totalPages,
                    onPageChange: setPage,
                    onPageSizeChange: (size) => {
                      setPageSize(size);
                      setPage(1);
                    },
                  }}
                  empty={
                    <>No invoices here. Issue one from an approved proforma, or create a standalone invoice.</>
                  }
                />
              </>
            ) : (
              <>
                <ListToolbar
                  search={
                    <SearchField
                      value={paymentsQInput}
                      onChange={setPaymentsQInput}
                      onSubmit={runPaymentsSearch}
                      placeholder="Receipt number"
                    />
                  }
                  filters={
                    <>
                      <FilterSelect
                        label="Customer"
                        value={paymentsCustomerFilter}
                        onChange={setPaymentsCustomer}
                        options={customers.map((c) => ({ value: c.id, label: c.name }))}
                        allLabel="All customers"
                      />
                      <FilterSelect
                        label="Method"
                        value={paymentsMethodFilter}
                        onChange={setPaymentsMethodFilterAndReset}
                        options={PAYMENT_METHOD_OPTIONS}
                        allLabel="All methods"
                      />
                      <DateFilter label="From" value={paymentsFrom} onChange={setPaymentsFromDate} />
                      <DateFilter label="To" value={paymentsTo} onChange={setPaymentsToDate} />
                    </>
                  }
                  actions={(['csv', 'xlsx'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => void onDownloadPayments(format)}
                      className={`${btnGhost} px-2.5 py-1.5 text-xs uppercase`}
                    >
                      {format}
                    </button>
                  ))}
                />
                <DataTable
                  columns={paymentColumns}
                  rows={payments}
                  getRowId={(payment) => payment.id}
                  getRowLabel={(payment) => `receipt ${payment.receiptNumber}`}
                  selectable
                  selectedIds={selectedPayments}
                  onSelectionChange={setSelectedPayments}
                  bulkActions={
                    <button
                      type="button"
                      onClick={exportSelectedPayments}
                      className={`${btnSecondary} px-2.5 py-1 text-xs`}
                    >
                      Export selected
                    </button>
                  }
                  loading={paymentsLoading}
                  caption="Payments"
                  pagination={{
                    page: paymentsPage,
                    pageSize: paymentsPageSize,
                    total: paymentsTotal,
                    totalPages: paymentsTotalPages,
                    onPageChange: setPaymentsPage,
                    onPageSizeChange: (size) => {
                      setPaymentsPageSize(size);
                      setPaymentsPage(1);
                    },
                  }}
                  empty={<>No payments match these filters. Record one to see it here.</>}
                />
              </>
            )}
          </section>
        </main>
      </div>

      {/* Record withholding */}
      <SideDrawer
        open={withholdTarget !== null}
        onClose={closeWithhold}
        title={
          withholdTarget ? `Withholding — ${withholdTarget.invoiceNumber}` : 'Withholding'
        }
        description="The credit this customer retained when settling the invoice."
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closeWithhold} className={`${btnSecondary} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              form="withhold-form"
              disabled={withholdSubmitting}
              className={`${btnPrimary} flex-1`}
            >
              {withholdSubmitting ? 'Saving…' : 'Record withholding'}
            </button>
          </div>
        }
      >
        <form id="withhold-form" onSubmit={(e) => void onWithhold(e)} className="space-y-4">
          {withholdError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {withholdError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="wht-amount">
              Amount (ETB)
            </label>
            <input
              id="wht-amount"
              type="number"
              step="0.01"
              min="0.01"
              className={fieldClass}
              required
              value={withholdAmount}
              onChange={(e) => setWithholdAmount(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="wht-voucher">
              Voucher reference (optional)
            </label>
            <input
              id="wht-voucher"
              className={fieldClass}
              value={withholdVoucher}
              onChange={(e) => setWithholdVoucher(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>

      {/* Allocate an existing payment */}
      <SideDrawer
        open={allocateTarget !== null}
        onClose={closeAllocate}
        title={allocateTarget ? `Allocate — ${allocateTarget.receiptNumber}` : 'Allocate'}
        description="Apply this receipt's remaining amount against open invoices."
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closeAllocate} className={`${btnSecondary} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              form="allocate-form"
              disabled={allocateSubmitting}
              className={`${btnPrimary} flex-1`}
            >
              {allocateSubmitting ? 'Allocating…' : 'Allocate'}
            </button>
          </div>
        }
      >
        <form id="allocate-form" onSubmit={(e) => void onSubmitAllocate(e)} className="space-y-4">
          {allocateError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {allocateError}
            </p>
          ) : null}
          {allocateTarget ? (
            <p className="text-xs text-slate-500">
              Remaining:{' '}
              {formatEtb(subtractEtb(allocateTarget.amountEtb, allocateTarget.allocatedEtb))}
            </p>
          ) : null}
          {allocateDrafts.length === 0 ? (
            <p className="text-xs text-slate-400">No open invoices for this customer.</p>
          ) : (
            <div className="space-y-2">
              {allocateDrafts.map((a) => (
                <div key={a.invoiceId} className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-slate-600">
                    {a.invoiceNumber}
                    {a.maxEtb ? (
                      <span className="ml-1 text-slate-400">(up to {formatEtb(a.maxEtb)})</span>
                    ) : null}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={a.maxEtb || undefined}
                    className={`${fieldClass} w-32`}
                    value={a.amountEtb}
                    onChange={(e) => setAllocateDraftAmount(a.invoiceId, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </form>
      </SideDrawer>
    </div>
  );
}
