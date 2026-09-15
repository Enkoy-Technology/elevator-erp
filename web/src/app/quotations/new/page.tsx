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
  getVatPercent,
  listProductTypes,
  priceQuotation,
  updateQuotationLine,
  listProjects,
  optional,
  type CalcInputPayload,
  type CalcResult,
  type ProductTypeRow,
  type Project,
  type UserRole,
} from '@/lib/api';
import { formatEtb, splitGrossEtb, withVatEtb } from '@/lib/money';
import { NumberInput } from '../number-input';

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
  const [vatApplies, setVatApplies] = useState(true);
  const [vatPercent, setVatPercent] = useState('15');
  const [offered, setOffered] = useState('');
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
    void getVatPercent()
      .then(setVatPercent)
      .catch(() => undefined);
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
        vatApplies,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes || undefined,
      });
      // The floors were counted here; name them G, 1, 2 … so nobody picks
      // them a second time on the offer. Basements and mezzanines are the
      // one thing the editor is still for. The first line carries the
      // quotation's own id.
      const floors = lift.floors ?? lift.stops ?? 2;
      const floorLabels = [
        'G',
        ...Array.from({ length: floors - 1 }, (_, i) => String(i + 1)),
      ].join(',');
      await updateQuotationLine(quotation.id, quotation.id, { floorLabels });
      // The price was decided here too: a figure other than the
      // calculator's is applied as the agreed price, VAT-inclusive when
      // VAT is on. Last, because any change to a line resets an agreed
      // price by design.
      if (offered.trim() && offered.trim() !== listGross) {
        await priceQuotation(quotation.id, offered.trim());
      }
      router.push(`/quotations/${quotation.id}/edit?step=price`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create quotation',
      );
    } finally {
      setCreating(false);
    }
  };

  const project = projects.find((p) => p.id === projectId);

  // What the offer will say, both ways. The calculator's figure is ex VAT;
  // the agreed figure is typed the way the customer hears it — inclusive
  // when VAT is on.
  const rate = vatApplies ? vatPercent : '0';
  const listNet = result?.pricing.totalBeforeMargin ?? null;
  const listGross = listNet ? withVatEtb(listNet, rate).grossEtb : null;
  const agreedGross = offered.trim() ? offered.trim() : listGross;
  const agreed = agreedGross ? splitGrossEtb(agreedGross, rate) : null;

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
            {result && listNet && listGross ? (
              <>
                <section className="rounded-2xl border-2 border-gold-500/40 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Price on the offer
                    </h2>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={vatApplies}
                        onChange={(e) => setVatApplies(e.target.checked)}
                      />
                      Charge VAT ({vatPercent}%)
                    </label>
                  </div>
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-1 font-medium"></th>
                        <th className="py-1 text-right font-medium">Ex VAT</th>
                        <th className="py-1 text-right font-medium">VAT</th>
                        <th className="py-1 text-right font-medium">
                          Incl. VAT
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr className="border-t border-slate-100">
                        <td className="py-1.5 text-slate-600">Calculator</td>
                        <td className="py-1.5 text-right">
                          {formatEtb(listNet)}
                        </td>
                        <td className="py-1.5 text-right">
                          {formatEtb(withVatEtb(listNet, rate).taxEtb)}
                        </td>
                        <td className="py-1.5 text-right font-semibold">
                          {formatEtb(listGross)}
                        </td>
                      </tr>
                      {agreed && agreedGross ? (
                        <tr className="border-t border-slate-100 font-semibold text-navy-900">
                          <td className="py-1.5">Offered to the customer</td>
                          <td className="py-1.5 text-right">
                            {formatEtb(agreed.netEtb)}
                          </td>
                          <td className="py-1.5 text-right">
                            {formatEtb(agreed.taxEtb)}
                          </td>
                          <td className="py-1.5 text-right">
                            {formatEtb(agreedGross)}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                  <label className="mt-4 block">
                    <span className={label}>
                      Price offered to the customer
                      {vatApplies ? ', incl. VAT' : ''} (ETB)
                    </span>
                    <NumberInput
                      value={offered}
                      onValueChange={setOffered}
                      placeholder={formatEtb(listGross)}
                      className={fieldClass}
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Leave blank to offer the calculator&apos;s figure. A round
                      number you agreed is split into net and VAT the way the
                      document prints it; both can still be changed on the offer
                      later.
                    </span>
                  </label>
                </section>
                <LiftResult result={result} products={products} />
              </>
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
