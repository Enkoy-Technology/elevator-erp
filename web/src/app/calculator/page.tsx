'use client';

import { btnPrimary } from '@/components/form-styles';

import { FormEvent, useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  calculateSpecs,
  type CalcInputPayload,
  type CalcResult,
  getAccessToken,
} from '@/lib/api';

const WORKED_EXAMPLE: CalcInputPayload = {
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
  taxPercent: 5,
};

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'outline-none transition focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20';

const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const formatMoney = (value: string): string =>
  new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
  }).format(Number(value));

export default function CalculatorPage() {
  const router = useRouter();
  const [form, setForm] = useState<CalcInputPayload>(WORKED_EXAMPLE);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  const setNumber =
    (key: keyof CalcInputPayload) => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [key]: Number(event.target.value) }));
    };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const next = await calculateSpecs(form);
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
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Capacity (kg)</span>
                <input
                  className={field}
                  type="number"
                  min={320}
                  max={5000}
                  value={form.capacityKg}
                  onChange={setNumber('capacityKg')}
                  required
                />
              </label>
              <label>
                <span className={label}>Stops</span>
                <input
                  className={field}
                  type="number"
                  min={2}
                  max={64}
                  value={form.stops}
                  onChange={setNumber('stops')}
                  required
                />
              </label>
              <label>
                <span className={label}>Travel height (m)</span>
                <input
                  className={field}
                  type="number"
                  min={3}
                  max={200}
                  step="0.01"
                  value={form.travelHeightM}
                  onChange={setNumber('travelHeightM')}
                  required
                />
              </label>
              <label>
                <span className={label}>Speed (m/s)</span>
                <input
                  className={field}
                  type="number"
                  min={0.4}
                  max={10}
                  step="0.01"
                  value={form.speedMs}
                  onChange={setNumber('speedMs')}
                  required
                />
              </label>
              <label>
                <span className={label}>Door width (mm)</span>
                <input
                  className={field}
                  type="number"
                  min={700}
                  max={1400}
                  value={form.doorWidthMm}
                  onChange={setNumber('doorWidthMm')}
                  required
                />
              </label>
              <label>
                <span className={label}>Margin %</span>
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.marginPercent}
                  onChange={setNumber('marginPercent')}
                  required
                />
              </label>
              <label>
                <span className={label}>Tax %</span>
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={50}
                  step="0.01"
                  value={form.taxPercent}
                  onChange={setNumber('taxPercent')}
                  required
                />
              </label>
            </div>

            <label className="block">
              <span className={label}>Machine room</span>
              <select
                className={field}
                value={form.machineRoomType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    machineRoomType: e.target.value as 'MR' | 'MRL',
                  }))
                }
              >
                <option value="MR">Machine Room (MR)</option>
                <option value="MRL">Machine Room Less (MRL)</option>
              </select>
            </label>

            <label className="block">
              <span className={label}>Door type</span>
              <select
                className={field}
                value={form.doorType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    doorType: e.target.value as CalcInputPayload['doorType'],
                  }))
                }
              >
                <option value="CENTER_OPEN">Center open</option>
                <option value="TELESCOPIC">Telescopic</option>
                <option value="SWING">Swing</option>
              </select>
            </label>

            <label className="block">
              <span className={label}>Building usage</span>
              <select
                className={field}
                value={form.buildingUsage}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    buildingUsage: e.target
                      .value as CalcInputPayload['buildingUsage'],
                  }))
                }
              >
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="HOSPITAL">Hospital</option>
                <option value="INDUSTRIAL">Industrial</option>
              </select>
            </label>

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
                Enter parameters and calculate to see technical specs and
                pricing. Defaults match the §4.2.4 worked example.
              </div>
            )}

            {result && (
              <>
                <section className="rounded-2xl bg-navy-800 p-6 text-white">
                  <p className="text-sm text-navy-100/70">Total price</p>
                  <p className="font-display mt-1 text-3xl font-bold tracking-tight text-gold-400">
                    {formatMoney(result.pricing.totalPrice)}
                  </p>
                  <p className="mt-2 text-xs text-navy-100/60">
                    Equipment {formatMoney(result.pricing.equipmentSubtotal)} ·
                    Margin {formatMoney(result.pricing.marginAmount)} · Tax{' '}
                    {formatMoney(result.pricing.taxAmount)}
                  </p>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Technical specifications
                  </h2>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    {(
                      [
                        ['Persons', result.technical.capacityPersons],
                        ['Car W×D×H (mm)', `${result.technical.carWidthMm}×${result.technical.carDepthMm}×${result.technical.carHeightMm}`],
                        ['Shaft W×D (mm)', `${result.technical.shaftWidthMm}×${result.technical.shaftDepthMm}`],
                        ['Pit depth (mm)', result.technical.pitDepthMm],
                        ['Overhead (mm)', result.technical.overheadClearanceMm],
                        ['Counterweight (kg)', result.technical.counterweightMassKg],
                        ['Motor (kW)', result.technical.motorPowerKw],
                        ['Guide rail', result.technical.guideRailSpec],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-slate-500">{k}</dt>
                        <dd className="font-medium text-slate-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Pricing breakdown (ETB)
                  </h2>
                  <dl className="space-y-2 text-sm">
                    {(
                      [
                        ['Base cost', result.pricing.baseCost],
                        ['Stop cost', result.pricing.stopCost],
                        ['Speed premium', result.pricing.speedPremium],
                        ['Door premium', result.pricing.doorPremium],
                        ['Installation', result.pricing.installationCost],
                        ['Freight', result.pricing.freightCost],
                        ['Before margin', result.pricing.totalBeforeMargin],
                        ['Margin', result.pricing.marginAmount],
                        ['Tax', result.pricing.taxAmount],
                      ] as const
                    ).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0"
                      >
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="font-medium tabular-nums">
                          {formatMoney(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
