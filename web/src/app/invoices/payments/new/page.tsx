'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass, labelClass } from '@/components/form-styles';
import { formatEtb, isPositiveEtb, subtractEtb, sumEtb } from '@/lib/money';
import {
  ApiError,
  getAccessToken,
  getCurrentRole,
  listBankAccounts,
  listCustomers,
  listInvoices,
  optional,
  recordPayment,
  type BankAccount,
  type Customer,
  type InvoiceListRow,
  type InvoiceStatus,
  type PaymentMethod,
  type UserRole,
} from '@/lib/api';

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

/** Mirrors PaymentsController's class-level @Roles('FINANCE');
 *  CEO/ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canManageFinance = (role: UserRole | null): boolean =>
  role === 'FINANCE' || role === 'CEO' || role === 'ADMIN';

interface AllocationDraft {
  invoiceId: string;
  invoiceNumber: string;
  /** Exact remaining room on this invoice — server-computed outstandingEtb. */
  maxEtb: string;
  amountEtb: string;
}

/** The one-shot "pay this invoice in full" prefill, carried in the URL. */
interface Prefill {
  invoiceId: string;
  amountEtb: string;
}

function toAllocationDrafts(
  invoices: InvoiceListRow[],
  prefill: Prefill | null,
): AllocationDraft[] {
  return invoices.map((invoice) => ({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    maxEtb: invoice.outstandingEtb,
    amountEtb: prefill && prefill.invoiceId === invoice.id ? prefill.amountEtb : '',
  }));
}

export default function NewPaymentPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  // Set once from the URL and never again, so the allocation fetch below can
  // depend on it without the "consume then clear" dance the drawer needed.
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [cameFromInvoice, setCameFromInvoice] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!canManageFinance(getCurrentRole())) {
      router.replace('/invoices');
      return;
    }
    // Read straight off window.location rather than useSearchParams: the
    // invoices list page already does this, and it keeps the route out of
    // Next's client-hook Suspense requirement.
    const params = new URLSearchParams(window.location.search);
    const prefillCustomerId = params.get('customerId');
    const prefillInvoiceId = params.get('invoiceId');
    const prefillAmount = params.get('amountEtb');
    if (prefillCustomerId) {
      setCustomerId(prefillCustomerId);
    }
    if (prefillInvoiceId && prefillAmount) {
      // Prefill both the payment amount and its allocation for the common
      // "pay this invoice in full" case — the user can still lower either
      // one (e.g. a partial payment) before submitting.
      setAmount(prefillAmount);
      setPrefill({ invoiceId: prefillInvoiceId, amountEtb: prefillAmount });
      setCameFromInvoice(true);
    }
    void (async () => {
      const [customerPage, bankPage] = await Promise.all([
        optional(listCustomers({ page: 1, pageSize: 100 })),
        optional(listBankAccounts({ page: 1, pageSize: 100 })),
      ]);
      setCustomers(customerPage.items);
      setBankAccounts(bankPage.items.filter((b) => b.isActive));
    })();
  }, [router]);

  // The selected customer's open invoices, for the allocation section.
  useEffect(() => {
    if (!customerId) {
      setAllocations([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await optional(listInvoices({ customerId, pageSize: 100 }));
      if (cancelled) {
        return;
      }
      const open = result.items.filter((i) => OPEN_STATUSES.has(i.status));
      setAllocations(toAllocationDrafts(open, prefill));
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, prefill]);

  const setAllocationAmount = (invoiceId: string, amountEtb: string) => {
    setAllocations((prev) =>
      prev.map((a) => (a.invoiceId === invoiceId ? { ...a, amountEtb } : a)),
    );
  };

  const backHref = cameFromInvoice ? '/invoices' : '/invoices?tab=payments';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Pick a customer first.');
      return;
    }
    if (BANK_METHODS.has(method) && !bankAccountId) {
      setError(`${PAYMENT_METHOD_LABEL[method]} requires a bank account.`);
      return;
    }
    const entered = allocations.filter((a) => isPositiveEtb(a.amountEtb || '0'));
    const allocatedTotal = sumEtb(entered.map((a) => a.amountEtb));
    // Mirrors PaymentsRepository.guardAndInsertAllocation's payment-total
    // check (Σ allocations <= payment.amountEtb) — the server is still the
    // authority, this just surfaces the same error before the round trip.
    if (isPositiveEtb(subtractEtb(allocatedTotal, amount || '0'))) {
      setError(
        `Allocations total ${formatEtb(allocatedTotal)}, which exceeds the payment amount of ${formatEtb(amount || '0.00')}.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await recordPayment({
        customerId,
        amountEtb: amount,
        method,
        receivedAt: receivedAt || undefined,
        bankAccountId: BANK_METHODS.has(method) ? bankAccountId : undefined,
        reference: reference || undefined,
        note: note || undefined,
        allocations: entered.map((a) => ({ invoiceId: a.invoiceId, amountEtb: a.amountEtb })),
      });
      router.push(backHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Finance"
      title="Record payment"
      description="Optionally allocate it against this customer's open invoices in the same step."
      backHref={backHref}
      backLabel={cameFromInvoice ? 'Invoices' : 'Payments'}
      error={error}
      submitting={submitting}
      submitLabel="Record payment"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Receipt">
        <Field label="Customer" htmlFor="pay-customer" wide>
          <select
            id="pay-customer"
            className={fieldClass}
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (ETB)" htmlFor="pay-amount">
          <input
            id="pay-amount"
            type="number"
            step="0.01"
            min="0.01"
            className={fieldClass}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Method" htmlFor="pay-method">
          <select
            id="pay-method"
            className={fieldClass}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {BANK_METHODS.has(method) ? (
          <Field label="Bank account" htmlFor="pay-bank" wide>
            <select
              id="pay-bank"
              className={fieldClass}
              required
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Select an account</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.bankName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Received (optional)" htmlFor="pay-received">
          <input
            id="pay-received"
            type="date"
            className={fieldClass}
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </Field>
        <Field label="Reference (optional)" htmlFor="pay-reference">
          <input
            id="pay-reference"
            className={fieldClass}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" htmlFor="pay-note" wide>
          <textarea
            id="pay-note"
            className={fieldClass}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </FormSection>

      {customerId ? (
        <FormSection
          title="Allocate (optional)"
          description="Apply this receipt against the customer's open invoices."
        >
          <div className="sm:col-span-2">
            {allocations.length === 0 ? (
              <p className="text-xs text-slate-400">This customer has no open invoices.</p>
            ) : (
              <div className="space-y-2">
                <span className={labelClass}>Open invoices</span>
                {allocations.map((a) => (
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
                      aria-label={`Allocate to ${a.invoiceNumber}`}
                      className={`${fieldClass} w-32`}
                      value={a.amountEtb}
                      onChange={(e) => setAllocationAmount(a.invoiceId, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormSection>
      ) : null}
    </FormPage>
  );
}
