'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  LiftInputs,
  LiftResult,
  toRequest,
  WORKED_EXAMPLE,
} from '@/app/calculator/lift-calculator';
import { btnPrimary, btnSecondary, fieldClass } from '@/components/form-styles';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  calculateSpecs,
  createQuotationFromCalc,
  getAccessToken,
  getCurrentRole,
  listProductTypes,
  listProjects,
  optional,
  type CalcInputPayload,
  type CalcResult,
  type ProductTypeRow,
  type Project,
  type UserRole,
} from '@/lib/api';

/**
 * A quotation starts in the calculator. The project names the product;
 * the salesperson describes the lift the way the calculator asks (shaft and
 * floors for a standard passenger lift, the classic figures otherwise),
 * sees the specs and the list price, and confirms — that lift becomes the
 * quotation's first line and the project moves to QUOTATION on its own.
 */

/** Mirrors @Roles on the quotation mutation routes; CEO and ADMIN bypass. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' ||
  role === 'SALESPERSON' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

const label =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function NewQuotationPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  const [form, setForm] = useState<CalcInputPayload>(WORKED_EXAMPLE);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!canWrite(getCurrentRole())) {
      router.replace('/quotations');
      return;
    }
    const wanted =
      new URLSearchParams(window.location.search).get('projectId') ?? '';
    void (async () => {
      const [projectPage, rows] = await Promise.all([
        optional(listProjects({ page: 1, pageSize: 100 })),
        listProductTypes().catch(() => [] as ProductTypeRow[]),
      ]);
      setProjects(projectPage.items);
      setProducts(rows);
      setProjectId((prev) => prev || wanted || projectPage.items[0]?.id || '');
    })();
  }, [router]);

  // The project chose the product when it was opened; changing the project
  // here follows it, and the result is stale until recalculated.
  useEffect(() => {
    const project = projects.find((p) => p.id === projectId);
    const productType =
      project?.productType &&
      products.some((p) => p.code === project.productType)
        ? project.productType
        : products[0]?.code;
    if (productType) {
      setForm((prev) =>
        prev.productType === productType ? prev : { ...prev, productType },
      );
    }
    setResult(null);
  }, [projectId, projects, products]);

  const onCalculate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCalculating(true);
    try {
      setResult(await calculateSpecs(toRequest(form)));
    } catch (err) {
      setResult(null);
      setError(
        err instanceof ApiError ? err.message : 'Calculation request failed',
      );
    } finally {
      setCalculating(false);
    }
  };

  const onCreate = async () => {
    if (!projectId) {
      setError('Create a project first, then draft a quote.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { taxPercent: _scenario, ...lift } = toRequest(form);
      const quotation = await createQuotationFromCalc(projectId, {
        ...lift,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes || undefined,
      });
      router.push(`/quotations/${quotation.id}/edit`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create quotation',
      );
    } finally {
      setCreating(false);
    }
  };

  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title="New quotation"
          description="Describe the lift, check the specs and the list price, then confirm. The lift becomes the first line of the offer; the price is agreed and the terms stated on the next screen."
          backHref={
            project ? `/customers/${project.customerId}` : '/quotations'
          }
          backLabel={project ? 'Customer' : 'Quotations'}
          actions={
            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={!result || creating || calculating}
              className={btnPrimary}
            >
              {creating ? 'Creating…' : 'Create quotation'}
            </button>
          }
        />

        <main className="grid flex-1 gap-8 bg-slate-50 px-4 py-6 sm:px-8 xl:grid-cols-[minmax(0,24rem)_1fr]">
          <form
            onSubmit={(event) => void onCalculate(event)}
            className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <label className="block">
              <span className={label}>Project</span>
              <select
                className={fieldClass}
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <LiftInputs form={form} setForm={setForm} products={products} />

            <label className="block">
              <span className={label}>Offer expires on</span>
              <input
                type="date"
                className={fieldClass}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Internal notes</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={calculating}
              className={`${btnSecondary} w-full`}
            >
              {calculating
                ? 'Calculating…'
                : result
                  ? 'Recalculate'
                  : 'Calculate'}
            </button>
          </form>

          <div className="space-y-6">
            {result ? (
              <LiftResult result={result} products={products} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center text-sm text-slate-500">
                Describe the lift and calculate. The specs and the list price
                appear here; Create quotation takes them onto the offer.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
