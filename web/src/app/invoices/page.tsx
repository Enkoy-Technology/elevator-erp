'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  fieldClass,
  labelClass,
} from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import { formatEtb, isPositiveEtb, isZeroEtb, subtractEtb, sumEtb, lineTotalEtb } from '@/lib/money';
import {
  ApiError,
  allocatePayment,
  createInvoice,
  downloadInvoiceDocument,
  downloadPayments,
  downloadReceiptDocument,
  getAccessToken,
  getCurrentRole,
  listBankAccounts,
  listCustomers,
  listInvoices,
  listPayments,
  listProjects,
  optional,
  recordInvoiceWithholding,
  recordPayment,
  reversePayment,
  voidInvoice,
  type BankAccount,
  type Customer,
  type DocumentFormat,
  type Invoice,
  type InvoiceListRow,
  type InvoiceStatus,
  type PaymentExportFormat,
  type PaymentListRow,
  type PaymentMethod,
  type Project,
  type UserRole,
} from '@/lib/api';

const PAGE_SIZE = 20;

type Tab = 'invoices' | 'payments';

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOID: 'Void',
};

const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  ISSUED: 'bg-amber-100 text-amber-700',
  PARTIALLY_PAID: 'bg-sky-100 text-sky-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  VOID: 'bg-slate-200 text-slate-500',
};

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

/** Rails that clear through a bank account — mirrors CreatePaymentDto's
 *  BankAccountRequiredConstraint (payments module). */
const BANK_METHODS = new Set<PaymentMethod>([
  'BANK_TRANSFER',
  'CHEQUE',
  'CBE_BIRR',
  'TELEBIRR',
]);

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

interface LineDraft {
  description: string;
  quantity: string;
  unitPriceEtb: string;
}

const EMPTY_LINE: LineDraft = { description: '', quantity: '1', unitPriceEtb: '0.00' };

interface AllocationDraft {
  invoiceId: string;
  invoiceNumber: string;
  /** Exact remaining room on this invoice — server-computed outstandingEtb. */
  maxEtb: string;
  amountEtb: string;
}

function toAllocationDrafts(
  invoices: InvoiceListRow[],
  prefill: { invoiceId: string; amountEtb: string } | null,
): AllocationDraft[] {
  return invoices.map((invoice) => ({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    maxEtb: invoice.outstandingEtb,
    amountEtb: prefill && prefill.invoiceId === invoice.id ? prefill.amountEtb : '',
  }));
}

export default function InvoicesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('invoices');
  const [role, setRole] = useState<UserRole | null>(null);

  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // --- Payments tab: paginated from GET /payments (persists across reloads,
  // unlike the earlier session-local placeholder). ---
  const [payments, setPayments] = useState<PaymentListRow[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
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

  // --- Create standalone invoice drawer ---
  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createProjectId, setCreateProjectId] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // --- Withholding drawer ---
  const [withholdTarget, setWithholdTarget] = useState<Invoice | null>(null);
  const [withholdAmount, setWithholdAmount] = useState('');
  const [withholdVoucher, setWithholdVoucher] = useState('');
  const [withholdError, setWithholdError] = useState<string | null>(null);
  const [withholdSubmitting, setWithholdSubmitting] = useState(false);

  // --- Record payment drawer (reachable from both tabs) ---
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('');
  const [paymentReceivedAt, setPaymentReceivedAt] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentAllocations, setPaymentAllocations] = useState<AllocationDraft[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const paymentPrefillRef = useRef<{ invoiceId: string; amountEtb: string } | null>(null);

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
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [customerPage, result] = await Promise.all([
          optional(listCustomers({ page: 1, pageSize: 100 })),
          listInvoices({
            status: status || undefined,
            customerId: customerId || undefined,
            q: query || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
        ]);
        setCustomers(customerPage.items);
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
    ) => {
      setPaymentsLoading(true);
      setError(null);
      try {
        const result = await listPayments({
          customerId: customerId || undefined,
          method: method || undefined,
          from: from || undefined,
          to: to || undefined,
          q: query || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
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
        refresh(page, statusFilter, customerFilter, q),
        refreshPayments(
          paymentsPage,
          paymentsCustomerFilter,
          paymentsMethodFilter,
          paymentsFrom,
          paymentsTo,
          paymentsQ,
        ),
      ]),
    [
      refresh,
      page,
      statusFilter,
      customerFilter,
      q,
      refreshPayments,
      paymentsPage,
      paymentsCustomerFilter,
      paymentsMethodFilter,
      paymentsFrom,
      paymentsTo,
      paymentsQ,
    ],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
    if (new URLSearchParams(window.location.search).get('tab') === 'payments') {
      setTab('payments');
    }
    void (async () => {
      const [projectPage, bankPage] = await Promise.all([
        optional(listProjects({ page: 1, pageSize: 100 })),
        optional(listBankAccounts({ page: 1, pageSize: 100 })),
      ]);
      setProjects(projectPage.items);
      setBankAccounts(bankPage.items.filter((b) => b.isActive));
    })();
  }, [router]);

  useEffect(() => {
    void refresh(page, statusFilter, customerFilter, q);
  }, [refresh, page, statusFilter, customerFilter, q]);

  useEffect(() => {
    void refreshPayments(
      paymentsPage,
      paymentsCustomerFilter,
      paymentsMethodFilter,
      paymentsFrom,
      paymentsTo,
      paymentsQ,
    );
  }, [
    refreshPayments,
    paymentsPage,
    paymentsCustomerFilter,
    paymentsMethodFilter,
    paymentsFrom,
    paymentsTo,
    paymentsQ,
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

  // Fetch the selected customer's open (ISSUED/PARTIALLY_PAID) invoices for
  // the record-payment drawer's allocation section whenever the drawer is
  // open and a customer is picked. Uses a ref (not state) for the one-shot
  // prefill so this effect's own deps stay just [paymentOpen, paymentCustomerId]
  // — otherwise clearing the prefill after consuming it would re-trigger the
  // fetch and wipe out anything the user had already typed.
  useEffect(() => {
    if (!paymentOpen || !paymentCustomerId) {
      setPaymentAllocations([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await optional(
        listInvoices({ customerId: paymentCustomerId, pageSize: 100 }),
      );
      if (cancelled) {
        return;
      }
      const open = result.items.filter((i) => OPEN_STATUSES.has(i.status));
      const prefill = paymentPrefillRef.current;
      paymentPrefillRef.current = null;
      setPaymentAllocations(toAllocationDrafts(open, prefill));
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentOpen, paymentCustomerId]);

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

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput.trim());
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

  const onPaymentsSearch = (event: FormEvent) => {
    event.preventDefault();
    setPaymentsPage(1);
    setPaymentsQ(paymentsQInput.trim());
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

  // ---- Create standalone invoice ----

  const openCreate = () => {
    setCreateCustomerId('');
    setCreateProjectId('');
    setCreateDueDate('');
    setLines([{ ...EMPTY_LINE }]);
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateError(null);
  };

  const setLineField = (index: number, field: keyof LineDraft, value: string) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const draftTotal = sumEtb(
    lines
      .filter((l) => l.quantity && l.unitPriceEtb)
      .map((l) => lineTotalEtb(l.quantity, l.unitPriceEtb)),
  );

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!createCustomerId) {
      setCreateError('Pick a customer first.');
      return;
    }
    const cleanLines = lines
      .map((l) => ({ ...l, description: l.description.trim() }))
      .filter((l) => l.description.length > 0);
    if (cleanLines.length === 0) {
      setCreateError('Add at least one line with a description.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await createInvoice({
        customerId: createCustomerId,
        projectId: createProjectId || undefined,
        lines: cleanLines,
        dueDate: createDueDate || undefined,
      });
      closeCreate();
      setPage(1);
      await refresh(1, statusFilter, customerFilter, q);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create invoice');
    } finally {
      setCreateSubmitting(false);
    }
  };

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
      await refresh(page, statusFilter, customerFilter, q);
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
      await refresh(page, statusFilter, customerFilter, q);
    } catch (err) {
      setWithholdError(
        err instanceof ApiError ? err.message : 'Failed to record withholding',
      );
    } finally {
      setWithholdSubmitting(false);
    }
  };

  // ---- Record payment (both tabs) ----

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentMethod('CASH');
    setPaymentBankAccountId('');
    setPaymentReceivedAt('');
    setPaymentReference('');
    setPaymentNote('');
    setPaymentAllocations([]);
    setPaymentError(null);
  };

  const openPaymentGeneral = () => {
    resetPaymentForm();
    setPaymentCustomerId('');
    paymentPrefillRef.current = null;
    setPaymentOpen(true);
  };

  const openPaymentForInvoice = (invoice: InvoiceListRow) => {
    resetPaymentForm();
    setPaymentCustomerId(invoice.customerId);
    // Prefill both the payment amount and its allocation for the common
    // "pay this invoice in full" case — the user can still lower either one
    // (e.g. a partial payment) before submitting. Exact for both ISSUED and
    // PARTIALLY_PAID now that outstandingEtb is server-computed for every
    // status (canPay only shows this action for those two statuses anyway).
    const remaining = invoice.outstandingEtb;
    setPaymentAmount(remaining);
    paymentPrefillRef.current = { invoiceId: invoice.id, amountEtb: remaining };
    setPaymentOpen(true);
  };

  const closePayment = () => {
    setPaymentOpen(false);
    setPaymentError(null);
  };

  const setAllocationAmount = (invoiceId: string, amountEtb: string) => {
    setPaymentAllocations((prev) =>
      prev.map((a) => (a.invoiceId === invoiceId ? { ...a, amountEtb } : a)),
    );
  };

  const onSubmitPayment = async (event: FormEvent) => {
    event.preventDefault();
    setPaymentError(null);
    if (!paymentCustomerId) {
      setPaymentError('Pick a customer first.');
      return;
    }
    if (BANK_METHODS.has(paymentMethod) && !paymentBankAccountId) {
      setPaymentError(`${PAYMENT_METHOD_LABEL[paymentMethod]} requires a bank account.`);
      return;
    }
    const entered = paymentAllocations.filter((a) => isPositiveEtb(a.amountEtb || '0'));
    const allocatedTotal = sumEtb(entered.map((a) => a.amountEtb));
    // Mirrors PaymentsRepository.guardAndInsertAllocation's payment-total
    // check (Σ allocations <= payment.amountEtb) — the server is still the
    // authority, this just surfaces the same error before the round trip.
    if (isPositiveEtb(subtractEtb(allocatedTotal, paymentAmount || '0'))) {
      setPaymentError(
        `Allocations total ${formatEtb(allocatedTotal)}, which exceeds the payment amount of ${formatEtb(paymentAmount || '0.00')}.`,
      );
      return;
    }
    setPaymentSubmitting(true);
    try {
      await recordPayment({
        customerId: paymentCustomerId,
        amountEtb: paymentAmount,
        method: paymentMethod,
        receivedAt: paymentReceivedAt || undefined,
        bankAccountId: BANK_METHODS.has(paymentMethod) ? paymentBankAccountId : undefined,
        reference: paymentReference || undefined,
        note: paymentNote || undefined,
        allocations: entered.map((a) => ({ invoiceId: a.invoiceId, amountEtb: a.amountEtb })),
      });
      closePayment();
      await refreshAfterPaymentMutation();
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
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
      setAllocateDrafts(toAllocationDrafts(open, null));
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

  const renderInvoiceActions = (invoice: InvoiceListRow) => {
    const busy = busyId === invoice.id;
    const canVoid = invoice.status === 'ISSUED' && isZeroEtb(invoice.whtEtb);
    const canPay = OPEN_STATUSES.has(invoice.status);
    const canWithhold = invoice.status !== 'VOID';
    return (
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && canPay ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => openPaymentForInvoice(invoice)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Record payment
          </button>
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
        {canWrite && canVoid ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onVoid(invoice)}
            className={`${btnDanger} px-2.5 py-1 text-xs`}
          >
            Void
          </button>
        ) : null}
        <div className="flex items-center gap-1">
          {(['pdf', 'docx', 'xlsx'] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={busy}
              onClick={() => void onDownloadInvoice(invoice, format)}
              className={`${btnGhost} px-2 py-1 text-xs uppercase`}
            >
              {format}
            </button>
          ))}
        </div>
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
      <div className="flex flex-wrap items-center gap-2">
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
        {canWrite && canReverse ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReverse(payment)}
            className={`${btnDanger} px-2.5 py-1 text-xs`}
          >
            Reverse
          </button>
        ) : null}
        <div className="flex items-center gap-1">
          {(['pdf', 'docx'] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={busy}
              onClick={() => void onDownloadReceipt(payment, format)}
              className={`${btnGhost} px-2 py-1 text-xs uppercase`}
            >
              {format}
            </button>
          ))}
        </div>
      </div>
    );
  };

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
                <button type="button" onClick={openPaymentGeneral} className={btnPrimary}>
                  Record payment
                </button>
              ) : null}
              {canWrite && tab === 'invoices' ? (
                <>
                  <button type="button" onClick={openPaymentGeneral} className={btnSecondary}>
                    Record payment
                  </button>
                  <button type="button" onClick={openCreate} className={btnPrimary}>
                    Create invoice
                  </button>
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

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {tab === 'invoices' ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Filter
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatus('')}
                    className={
                      statusFilter === ''
                        ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                        : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                    }
                  >
                    All
                  </button>
                  {INVOICE_FILTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={
                        statusFilter === s
                          ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                          : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                      }
                    >
                      {INVOICE_STATUS_LABEL[s]}
                    </button>
                  ))}
                  <select
                    className={`${fieldClass} ml-auto w-48`}
                    value={customerFilter}
                    onChange={(e) => setCustomer(e.target.value)}
                  >
                    <option value="">All customers</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <form onSubmit={onSearch} className="flex items-center gap-2">
                    <input
                      className={`${fieldClass} w-40`}
                      placeholder="Invoice number"
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                    />
                    <button type="submit" className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                      Search
                    </button>
                  </form>
                </div>

                {loading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : invoices.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                    <p className="text-sm text-slate-500">No invoices yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-4 font-semibold">Number</th>
                            <th className="py-2 pr-4 font-semibold">Customer</th>
                            <th className="py-2 pr-4 font-semibold">Issued</th>
                            <th className="py-2 pr-4 font-semibold">Due</th>
                            <th className="py-2 pr-4 font-semibold">Total</th>
                            <th className="py-2 pr-4 font-semibold">Outstanding</th>
                            <th className="py-2 pr-4 font-semibold">Status</th>
                            <th className="py-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                                {inv.invoiceNumber}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {customerMap[inv.customerId] ?? inv.customerId.slice(0, 8)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {inv.issuedAt.slice(0, 10)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {inv.dueDate ?? '—'}
                              </td>
                              <td className="py-3 pr-4 font-semibold text-navy-800">
                                {formatEtb(inv.totalEtb)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {outstandingDisplay(inv)}
                              </td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${INVOICE_STATUS_BADGE[inv.status]}`}
                                >
                                  {INVOICE_STATUS_LABEL[inv.status]}
                                </span>
                              </td>
                              <td className="py-3">{renderInvoiceActions(inv)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={total}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Filter
                  </span>
                  <select
                    className={`${fieldClass} w-48`}
                    value={paymentsCustomerFilter}
                    onChange={(e) => setPaymentsCustomer(e.target.value)}
                  >
                    <option value="">All customers</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${fieldClass} w-40`}
                    value={paymentsMethodFilter}
                    onChange={(e) =>
                      setPaymentsMethodFilterAndReset(e.target.value as PaymentMethod | '')
                    }
                  >
                    <option value="">All methods</option>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    aria-label="From"
                    className={`${fieldClass} w-40`}
                    value={paymentsFrom}
                    onChange={(e) => setPaymentsFromDate(e.target.value)}
                  />
                  <input
                    type="date"
                    aria-label="To"
                    className={`${fieldClass} w-40`}
                    value={paymentsTo}
                    onChange={(e) => setPaymentsToDate(e.target.value)}
                  />
                  <form onSubmit={onPaymentsSearch} className="flex items-center gap-2">
                    <input
                      className={`${fieldClass} w-40`}
                      placeholder="Receipt number"
                      value={paymentsQInput}
                      onChange={(e) => setPaymentsQInput(e.target.value)}
                    />
                    <button type="submit" className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                      Search
                    </button>
                  </form>
                  <div className="ml-auto flex items-center gap-1">
                    {(['csv', 'xlsx'] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => void onDownloadPayments(format)}
                        className={`${btnGhost} px-2 py-1 text-xs uppercase`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentsLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                    <p className="text-sm text-slate-500">No payments found.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-4 font-semibold">Receipt</th>
                            <th className="py-2 pr-4 font-semibold">Customer</th>
                            <th className="py-2 pr-4 font-semibold">Received</th>
                            <th className="py-2 pr-4 font-semibold">Method</th>
                            <th className="py-2 pr-4 font-semibold">Amount</th>
                            <th className="py-2 pr-4 font-semibold">Allocated</th>
                            <th className="py-2 pr-4 font-semibold">Unallocated</th>
                            <th className="py-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                                {p.receiptNumber}
                                {p.reversalOfPaymentId ? (
                                  <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                                    Reversal
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {p.customerName ?? p.customerId.slice(0, 8)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {p.receivedAt.slice(0, 10)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {PAYMENT_METHOD_LABEL[p.method]}
                              </td>
                              <td className="py-3 pr-4 font-semibold text-navy-800">
                                {formatEtb(p.amountEtb)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {formatEtb(p.allocatedEtb)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {formatEtb(subtractEtb(p.amountEtb, p.allocatedEtb))}
                              </td>
                              <td className="py-3">{renderPaymentActions(p)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={paymentsPage}
                      pageSize={PAGE_SIZE}
                      total={paymentsTotal}
                      totalPages={paymentsTotalPages}
                      onPageChange={setPaymentsPage}
                    />
                  </>
                )}
              </>
            )}
          </section>
        </main>
      </div>

      {/* Create standalone invoice */}
      <SideDrawer
        open={createOpen}
        onClose={closeCreate}
        title="Create invoice"
        description="Standalone billing (e.g. maintenance) — the server recomputes VAT and the total from these lines."
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closeCreate} className={`${btnSecondary} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              form="create-invoice-form"
              disabled={createSubmitting}
              className={`${btnPrimary} flex-1`}
            >
              {createSubmitting ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
        }
      >
        <form id="create-invoice-form" onSubmit={(e) => void onCreate(e)} className="space-y-4">
          {createError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="inv-customer">
              Customer
            </label>
            <select
              id="inv-customer"
              className={fieldClass}
              required
              value={createCustomerId}
              onChange={(e) => setCreateCustomerId(e.target.value)}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-project">
              Project (optional)
            </label>
            <select
              id="inv-project"
              className={fieldClass}
              value={createProjectId}
              onChange={(e) => setCreateProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-due">
              Due date (optional)
            </label>
            <input
              id="inv-due"
              type="date"
              className={fieldClass}
              value={createDueDate}
              onChange={(e) => setCreateDueDate(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelClass}>Lines</span>
              <button
                type="button"
                onClick={addLine}
                className="text-xs font-semibold text-navy-800 hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <input
                    className={`${fieldClass} mb-2`}
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => setLineField(index, 'description', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className={fieldClass}
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => setLineField(index, 'quantity', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={fieldClass}
                      placeholder="Unit price"
                      value={line.unitPriceEtb}
                      onChange={(e) => setLineField(index, 'unitPriceEtb', e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(index)}
                      className={`${btnGhost} justify-self-end px-2 text-xs disabled:opacity-30`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Estimated total (excl. VAT):{' '}
            <span className="font-semibold text-navy-800">{formatEtb(draftTotal)}</span>
            <br />
            <span className="text-xs text-slate-400">
              Display-only — the server computes VAT and the real total.
            </span>
          </p>
        </form>
      </SideDrawer>

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

      {/* Record payment */}
      <SideDrawer
        open={paymentOpen}
        onClose={closePayment}
        title="Record payment"
        description="Optionally allocate it against this customer's open invoices in the same step."
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closePayment} className={`${btnSecondary} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              form="payment-form"
              disabled={paymentSubmitting}
              className={`${btnPrimary} flex-1`}
            >
              {paymentSubmitting ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        }
      >
        <form id="payment-form" onSubmit={(e) => void onSubmitPayment(e)} className="space-y-4">
          {paymentError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {paymentError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="pay-customer">
              Customer
            </label>
            <select
              id="pay-customer"
              className={fieldClass}
              required
              value={paymentCustomerId}
              onChange={(e) => setPaymentCustomerId(e.target.value)}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="pay-amount">
                Amount (ETB)
              </label>
              <input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                className={fieldClass}
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pay-method">
                Method
              </label>
              <select
                id="pay-method"
                className={fieldClass}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {BANK_METHODS.has(paymentMethod) ? (
            <div>
              <label className={labelClass} htmlFor="pay-bank">
                Bank account
              </label>
              <select
                id="pay-bank"
                className={fieldClass}
                required
                value={paymentBankAccountId}
                onChange={(e) => setPaymentBankAccountId(e.target.value)}
              >
                <option value="">Select an account</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.bankName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="pay-received">
                Received (optional)
              </label>
              <input
                id="pay-received"
                type="date"
                className={fieldClass}
                value={paymentReceivedAt}
                onChange={(e) => setPaymentReceivedAt(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pay-reference">
                Reference (optional)
              </label>
              <input
                id="pay-reference"
                className={fieldClass}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-note">
              Note (optional)
            </label>
            <textarea
              id="pay-note"
              className={fieldClass}
              rows={2}
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
          </div>

          {paymentCustomerId ? (
            <div>
              <span className={labelClass}>Allocate (optional)</span>
              {paymentAllocations.length === 0 ? (
                <p className="text-xs text-slate-400">
                  This customer has no open invoices.
                </p>
              ) : (
                <div className="space-y-2">
                  {paymentAllocations.map((a) => (
                    <div key={a.invoiceId} className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-xs text-slate-600">
                        {a.invoiceNumber}
                        {a.maxEtb ? (
                          <span className="ml-1 text-slate-400">
                            (up to {formatEtb(a.maxEtb)})
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={a.maxEtb || undefined}
                        className={`${fieldClass} w-32`}
                        value={a.amountEtb}
                        onChange={(e) => setAllocationAmount(a.invoiceId, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
