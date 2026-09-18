'use client';

import { btnPrimary } from '@/components/form-styles';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  calculateSpecs,
  listProductTypes,
  type ProductTypeRow,
  type CalcInputPayload,
  type CalcResult,
  getAccessToken,
} from '@/lib/api';
import {
  LiftInputs,
  LiftResult,
  toRequest,
  WORKED_EXAMPLE,
} from './lift-calculator';

export default function CalculatorPage() {
  const router = useRouter();
  const [form, setForm] = useState<CalcInputPayload>(WORKED_EXAMPLE);
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void listProductTypes()
      .then((rows) => {
        setProducts(rows);
        setForm((prev) =>
          rows.some((r) => r.code === prev.productType)
            ? prev
            : { ...prev, productType: rows[0]?.code ?? prev.productType },
        );
      })
      .catch(() => undefined);
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const next = await calculateSpecs(toRequest(form, products));
      setResult(next);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof ApiError ? err.message : 'Calculation request failed',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <h1 className="font-display text-lg font-semibold">
            Elevator Calculator
          </h1>
          <p className="text-xs text-slate-500">
            Stateless EN 81 technical specs and pricing (Phase 1)
          </p>
        </header>

        <main className="grid flex-1 gap-8 px-8 py-8 xl:grid-cols-[minmax(0,22rem)_1fr]">
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <LiftInputs form={form} setForm={setForm} products={products} />

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className={`${btnPrimary} flex-1`}
              >
                {submitting ? 'Calculating…' : 'Calculate'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(WORKED_EXAMPLE);
                  setResult(null);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="space-y-6">
            {!result && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center text-sm text-slate-500">
                Enter the lift and calculate to see its technical specs and list
                price.
              </div>
            )}

            {result && <LiftResult result={result} products={products} />}
          </div>
        </main>
      </div>
    </div>
  );
}
