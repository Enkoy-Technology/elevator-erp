'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { btnGhost, fieldClass, labelClass } from '@/components/form-styles';
import { formatEtb, lineTotalEtb, sumEtb } from '@/lib/money';
import {
  ApiError,
  createInvoice,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  listProjects,
  optional,
  type Customer,
  type Project,
  type UserRole,
} from '@/lib/api';

interface LineDraft {
  description: string;
  quantity: string;
  unitPriceEtb: string;
}

const EMPTY_LINE: LineDraft = { description: '', quantity: '1', unitPriceEtb: '0.00' };

/** Mirrors InvoicesController's class-level @Roles('FINANCE');
 *  CEO/ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canManageFinance = (role: UserRole | null): boolean =>
  role === 'FINANCE' || role === 'CEO' || role === 'GENERAL_MANAGER' || role === 'ADMIN';

export default function NewInvoicePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    // The list page only offers this action to finance; the route has to say
    // the same thing rather than render a form the API will reject.
    if (!canManageFinance(getCurrentRole())) {
      router.replace('/invoices');
      return;
    }
    void (async () => {
      const [customerPage, projectPage] = await Promise.all([
        optional(listCustomers({ page: 1, pageSize: 100 })),
        optional(listProjects({ page: 1, pageSize: 100 })),
      ]);
      setCustomers(customerPage.items);
      setProjects(projectPage.items);
    })();
  }, [router]);

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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError('Pick a customer first.');
      return;
    }
    const cleanLines = lines
      .map((l) => ({ ...l, description: l.description.trim() }))
      .filter((l) => l.description.length > 0);
    if (cleanLines.length === 0) {
      setError('Add at least one line with a description.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createInvoice({
        customerId,
        projectId: projectId || undefined,
        lines: cleanLines,
        dueDate: dueDate || undefined,
      });
      router.push('/invoices');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Finance"
      title="New invoice"
      description="Standalone billing (e.g. maintenance) — the server recomputes VAT and the total from these lines."
      backHref="/invoices"
      backLabel="Invoices"
      error={error}
      submitting={submitting}
      submitLabel="Create invoice"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Billing">
        <Field label="Customer" htmlFor="inv-customer">
          <select
            id="inv-customer"
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
        <Field label="Project (optional)" htmlFor="inv-project">
          <select
            id="inv-project"
            className={fieldClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date (optional)" htmlFor="inv-due">
          <input
            id="inv-due"
            type="date"
            className={fieldClass}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Lines">
        <div className="sm:col-span-2">
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

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Estimated total (excl. VAT):{' '}
            <span className="font-semibold text-navy-800">{formatEtb(draftTotal)}</span>
            <br />
            <span className="text-xs text-slate-400">
              Display-only — the server computes VAT and the real total.
            </span>
          </p>
        </div>
      </FormSection>
    </FormPage>
  );
}
