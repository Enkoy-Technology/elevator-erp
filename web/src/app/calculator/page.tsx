'use client';

import { btnPrimary } from '@/components/form-styles';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Sidebar } from '@/components/sidebar';
import {
  calculateSpecs,
  listProductTypes,
  type ProductTypeRow,
  type CalcInputPayload,
  getAccessToken,
} from '@/lib/api';
import {
  toRequest,
  WORKED_EXAMPLE,
  type PassengerShaft,
} from '@/lib/lift-form';
import {
  LiftInputs,
  LiftResult,
  StaleNote,
  useCalculation,
} from './lift-calculator';

export default function CalculatorPage() {
  const router = useRouter();
  const [form, setForm] = useState<CalcInputPayload>(WORKED_EXAMPLE);
  const passengerShaft = useRef<PassengerShaft | null>(null);
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  // Open figures on the specification are saved or cancelled before Calculate,
  // whose new result would close them and lose what was typed.
  const [editing, setEditing] = useState(false);
  const {
    calculated,
    setCalculated,
    error,
    calculating,
    calculate,
    stale,
    clear,
  } = useCalculation(form, products);

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

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void calculate();
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
            onSubmit={onSubmit}
            className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <LiftInputs
              form={form}
              setForm={setForm}
              products={products}
              passengerShaft={passengerShaft}
            />

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
                disabled={calculating || editing}
                className={`${btnPrimary} flex-1`}
              >
                {calculating ? 'Calculating…' : 'Calculate'}
              </button>
              <button
                type="button"
                disabled={calculating}
                onClick={() => {
                  setForm(WORKED_EXAMPLE);
                  clear();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="space-y-6">
            {stale ? <StaleNote /> : null}
            {calculated ? (
              // The last lift's figures stay, faded, until Calculate is pressed.
              <div
                className={`space-y-6 transition-opacity ${stale ? 'opacity-50' : ''}`}
              >
                <LiftResult
                  result={calculated.result}
                  products={products}
                  onEditingChange={setEditing}
                  onEditCapacity={
                    stale || calculating
                      ? undefined
                      : async (edit) => {
                          const next = { ...form, ...edit };
                          const result = await calculateSpecs(
                            toRequest(next, products),
                          );
                          // Left as it was if the lift was changed while this saved.
                          setForm((prev) => (prev === form ? next : prev));
                          setCalculated({ form: next, result });
                        }
                  }
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center text-sm text-slate-500">
                Enter the lift and calculate to see its technical specs and list
                price.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
