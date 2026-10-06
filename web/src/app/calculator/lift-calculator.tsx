'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

import { NumberInput } from '@/app/quotations/number-input';

import { formatNumber } from '@/lib/money';
import {
  productName,
  type CalcInputPayload,
  type CalcRequestPayload,
  type CalcResult,
  type ProductTypeRow,
} from '@/lib/api';

/**
 * A passenger lift is described by its shaft and floors alone: the company's
 * standard table names the lift, and the API fills in the rest. The classic
 * figures below stay for every other product.
 */
export const WORKED_EXAMPLE: CalcInputPayload = {
  productType: 'PASSENGER',
  shaftWidthMm: 1835,
  shaftDepthMm: 1750,
  floors: 12,
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  // The calculator shows the list price only; margin and VAT belong to the
  // quotation, where the statutory rate and the agreed price live.
  marginPercent: 0,
  taxPercent: 0,
};

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'outline-none transition focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20';

const label =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

type NumberKey =
  | 'shaftWidthMm'
  | 'shaftDepthMm'
  | 'floors'
  | 'capacityKg'
  | 'stops'
  | 'travelHeightM'
  | 'speedMs'
  | 'doorWidthMm';

/** The products the company's shaft table describes: the passenger lift and its finishes. Mirrors the API's PASSENGER_CLASS_PRODUCTS. */
export const STANDARD_LIFT_PRODUCTS: readonly string[] = [
  'PASSENGER',
  'HOSPITAL',
  'PANORAMIC',
  'HOME',
  'CARGO',
];
export const isStandardLift = (productType: string): boolean =>
  STANDARD_LIFT_PRODUCTS.includes(productType);

/** The request the API wants: shaft and floors for a standard lift, everything for the rest. */
/**
 * The capacity to start a product at: its own minimum when the current figure
 * is below it (a car lift is sold from 3,500 kg — better to open on that
 * than to type 1,000 and be told no), otherwise what was there.
 */
/**
 * Mirrors the API's vehicle-specs.ts: the speed and door the company's
 * standard specification (2026-10-06) gives each vehicle product and the
 * escalator, which the form starts at when one is chosen.
 */
export const VEHICLE_STANDARD: Readonly<
  Record<string, { speedMs: number; doorWidthMm?: number }>
> = {
  CAR_LIFT: { speedMs: 0.5, doorWidthMm: 2600 },
  CAR_PLATFORM_LIFT: { speedMs: 0.3, doorWidthMm: 2600 },
  CAR_STACKING_LIFT: { speedMs: 0.15 },
  ESCALATOR: { speedMs: 0.5 },
};

/**
 * The speed and door to start a product at: the company's standard for a
 * vehicle product or escalator, the passenger defaults when coming back
 * from one (a vehicle's figures would be absurd on a passenger lift).
 */
export const startingSpeedAndDoor = (
  productType: string,
  current: { speedMs: number; doorWidthMm: number },
): { speedMs: number; doorWidthMm: number } => {
  const standard = VEHICLE_STANDARD[productType];
  if (standard) {
    return {
      speedMs: standard.speedMs,
      doorWidthMm: standard.doorWidthMm ?? current.doorWidthMm,
    };
  }
  const fromVehicle = Object.values(VEHICLE_STANDARD).some(
    (s) => s.speedMs === current.speedMs,
  );
  return {
    speedMs: fromVehicle ? WORKED_EXAMPLE.speedMs : current.speedMs,
    doorWidthMm:
      current.doorWidthMm >= 2400 ? WORKED_EXAMPLE.doorWidthMm : current.doorWidthMm,
  };
};

export const startingCapacityKg = (
  products: readonly ProductTypeRow[],
  productType: string,
  currentKg: number,
): number => {
  const min = products.find((p) => p.code === productType)?.minCapacityKg;
  return min != null && currentKg < min ? min : currentKg;
};

/** Whether the product's price is its rise (an escalator) — the one product that still asks for it. */
export const usesRise = (
  products: readonly ProductTypeRow[],
  productType: string,
): boolean =>
  /\brise\b/i.test(
    products.find((p) => p.code === productType)?.effectiveFormula ?? '',
  );

export const toRequest = (
  form: CalcInputPayload,
  products: readonly ProductTypeRow[] = [],
): CalcRequestPayload => {
  const {
    shaftWidthMm,
    shaftDepthMm,
    floors,
    capacityKg,
    stops,
    travelHeightM,
    speedMs,
    doorType,
    doorWidthMm,
    ...common
  } = form;
  return isStandardLift(form.productType)
    ? { ...common, shaftWidthMm, shaftDepthMm, floors }
    : {
        ...common,
        capacityKg,
        stops,
        // Travel is 3.5 m × stops on the API; only a rise-priced product sends it.
        ...(usesRise(products, form.productType) ? { travelHeightM } : {}),
        speedMs,
        doorType,
        doorWidthMm,
      };
};

const doorLabel = (input: CalcInputPayload): string =>
  `${input.doorType === 'CENTER_OPEN' ? 'CO' : input.doorType === 'TELESCOPIC' ? '2S' : 'Side'} ${formatNumber(input.doorWidthMm)} × 2,100`;

export const formatMoney = (value: string): string =>
  new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
  }).format(Number(value));

/**
 * The lift as the salesperson describes it: the product, then — for a
 * standard passenger lift — the shaft and the floors, or the classic
 * figures for everything else. Shared by the calculator and by the start
 * of a quotation, so a lift is described the same way in both places.
 */
export const LiftInputs = ({
  form,
  setForm,
  products,
}: {
  form: CalcInputPayload;
  setForm: Dispatch<SetStateAction<CalcInputPayload>>;
  products: readonly ProductTypeRow[];
}) => {
  // What the salesperson has typed, kept as text so "1." survives until the
  // next digit; the form only ever sees the number. A browser number input
  // here showed spinner arrows and could not be cleared to retype — the
  // client asked for typing, not arrows.
  const [drafts, setDrafts] = useState<Partial<Record<NumberKey, string>>>({});
  const numberField = (key: NumberKey, text: string) => {
    // A draft is only shown while it still means the form's value; a Reset
    // or any other outside change to the form drops it.
    const draft = drafts[key];
    const value =
      draft !== undefined && Number(draft) === form[key]
        ? draft
        : String(form[key] ?? '');
    return (
      <label>
        <span className={label}>{text}</span>
        <NumberInput
          className={field}
          value={value}
          onValueChange={(raw) => {
            setDrafts((prev) => ({ ...prev, [key]: raw }));
            setForm((prev) => ({ ...prev, [key]: Number(raw) }));
          }}
        />
      </label>
    );
  };
  const standard = isStandardLift(form.productType);

  return (
    <>
      <label className="block">
        <span className={label}>Product</span>
        <select
          className={field}
          value={form.productType}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              productType: e.target.value,
              capacityKg: startingCapacityKg(
                products,
                e.target.value,
                prev.capacityKg,
              ),
              ...startingSpeedAndDoor(e.target.value, prev),
            }))
          }
        >
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        {products.some(
          (p) =>
            p.code === form.productType &&
            Number(p.perStopEtb) === 0 &&
            Number(p.perKgEtb) === 0,
        ) && (
          <span className="mt-1 block text-xs text-slate-500">
            Flat price — stops and capacity do not change it.
          </span>
        )}
      </label>

      {standard ? (
        <div className="grid grid-cols-2 gap-3">
          {numberField('shaftWidthMm', 'Shaft width (mm)')}
          {numberField('shaftDepthMm', 'Shaft depth (mm)')}
          {numberField('floors', 'Number of floors')}
          <p className="col-span-2 text-xs text-slate-500">
            Persons, rated load, speed, car and door follow from the shaft and
            the floors — the company&apos;s standard passenger table.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {standard ? null : (
          <>
            {numberField('capacityKg', 'Capacity (kg)')}
            {numberField('stops', 'Stops')}
            {usesRise(products, form.productType)
              ? numberField('travelHeightM', 'Rise (m)')
              : null}
            {numberField('speedMs', 'Speed (m/s)')}
            {numberField('doorWidthMm', 'Door width (mm)')}
          </>
        )}
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

      {standard ? null : (
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
            <option value="SWING">Side opening</option>
          </select>
        </label>
      )}

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
    </>
  );
};

/** What the calculator found: the list price, the specs, the working, the breakdown. */
export const LiftResult = ({
  result,
  products,
}: {
  result: CalcResult;
  products: readonly ProductTypeRow[];
}) => (
  <>
    <section className="rounded-2xl bg-navy-800 p-6 text-white">
      <p className="text-sm text-navy-100/70">List price</p>
      <p className="font-display mt-1 text-3xl font-bold tracking-tight text-gold-400">
        {formatMoney(result.pricing.totalBeforeMargin)}
      </p>
      <p className="mt-2 text-xs text-navy-100/60">
        Before VAT. The quotation adds the statutory rate.
      </p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Technical specifications
      </h2>
      {result.input.floors !== undefined ? (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {(
              [
                ['Persons', formatNumber(result.technical.capacityPersons)],
                ['Rated load (kg)', formatNumber(result.input.capacityKg)],
                ['Speed (m/s)', String(result.input.speedMs)],
                [
                  'Car W×D×CH (mm)',
                  `${formatNumber(result.technical.carWidthMm)} × ${formatNumber(result.technical.carDepthMm)} × ${formatNumber(result.technical.carHeightMm)}`,
                ],
                ['Door (mm)', doorLabel(result.input)],
                [
                  'Shaft W×D (mm)',
                  `${formatNumber(result.technical.shaftWidthMm)} × ${formatNumber(result.technical.shaftDepthMm)}`,
                ],
                ['Standard lift', result.technical.standardLift ?? '—'],
                ['Floors / stops', formatNumber(result.input.stops)],
                [
                  'Travel (mm)',
                  formatNumber(Math.round(result.input.travelHeightM * 1000)),
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {result.notes.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : result.technical.specSheet ? (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {(
              [
                ['Rated load (kg)', formatNumber(result.input.capacityKg)],
                ['Speed (m/s)', String(result.input.speedMs)],
                ['Stops', formatNumber(result.input.stops)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            {result.technical.specSheet.map((row) => (
              <div key={row.label} className="grid gap-1 py-2 sm:grid-cols-[14rem_1fr]">
                <dt className="text-xs text-slate-500 sm:pt-0.5">{row.label}</dt>
                <dd className="text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>
          {result.notes.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : result.technical.capacityPersons === null ? (
        <p className="text-sm text-slate-500">
          {productName(products, result.technical.productType)} is priced as a
          flat product — the EN 81 shaft and machine calculations apply to
          passenger lifts only.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {(
            [
              ['Persons', formatNumber(result.technical.capacityPersons)],
              ['Stops', formatNumber(result.input.stops)],
              [
                'Travel (mm)',
                formatNumber(Math.round(result.input.travelHeightM * 1000)),
              ],
              [
                'Car W×D×H (mm)',
                `${formatNumber(result.technical.carWidthMm)}×${formatNumber(result.technical.carDepthMm)}×${formatNumber(result.technical.carHeightMm)}`,
              ],
              [
                'Shaft W×D (mm)',
                `${formatNumber(result.technical.shaftWidthMm)}×${formatNumber(result.technical.shaftDepthMm)}`,
              ],
              ['Pit depth (mm)', formatNumber(result.technical.pitDepthMm)],
              [
                'Overhead (mm)',
                formatNumber(result.technical.overheadClearanceMm),
              ],
              [
                'Counterweight (kg)',
                formatNumber(result.technical.counterweightMassKg, {
                  decimals: 2,
                }),
              ],
              [
                'Motor (kW)',
                formatNumber(result.technical.motorPowerKw, {
                  decimals: 2,
                }),
              ],
              ['Guide rail', result.technical.guideRailSpec ?? '—'],
              [
                'Machine room W×D×H (mm)',
                result.technical.machineRoomWidthMm === null
                  ? 'None (MRL)'
                  : `${formatNumber(result.technical.machineRoomWidthMm)}×${formatNumber(result.technical.machineRoomDepthMm)}×${formatNumber(result.technical.machineRoomHeightMm)}`,
              ],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        How the price is calculated
      </h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Formula</dt>
          <dd className="font-mono text-[13px] text-slate-900">
            {result.formula.text}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">This lift</dt>
          <dd className="font-mono text-[13px] text-slate-900">
            {result.formula.working}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-400">
        Edit the formula under Settings → Pricing, or per product under Products
        &amp; prices.
      </p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Pricing breakdown (ETB)
      </h2>
      <dl className="space-y-2 text-sm">
        {(
          [
            ['Base price', result.pricing.basePrice],
            ['Additional stops / rise', result.pricing.stopsAdjustment],
            ['Additional capacity', result.pricing.capacityAdjustment],
            ...(result.pricing.listVatIncluded
              ? ([
                  [
                    'Less VAT included in list',
                    `-${result.pricing.listVatIncluded}`,
                  ],
                ] as const)
              : []),
            ['List price', result.pricing.totalBeforeMargin],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0"
          >
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-medium tabular-nums">{formatMoney(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  </>
);
