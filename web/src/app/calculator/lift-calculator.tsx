'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { NumberInput } from '@/app/quotations/number-input';
import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';

import { formatNumber, sumEtb } from '@/lib/money';
import {
  ApiError,
  calculateSpecs,
  productName,
  type CalcInputPayload,
  type CalcResult,
  type ProductTypeRow,
} from '@/lib/api';
import {
  VEHICLE_STANDARD,
  hasDoor,
  hasMachineRoom,
  isStandardLift,
  capacityEdit,
  isVehicleProduct,
  usesRise,
  withProduct,
  type CapacityEdit,
  type CapacityFigures,
  type PassengerShaft,
  toRequest,
} from '@/lib/lift-form';

/** A calculation and the figures it was made from. */
export type Calculated = { form: CalcInputPayload; result: CalcResult };

/**
 * Calculates the lift as it is described, half a second after the last
 * change, so the price and specs on screen follow the shaft (client,
 * 2026-10-30: a changed shaft kept the last one's price until Calculate).
 * A reply for figures changed since is dropped, so the last change wins
 * however many are made. `retry` asks again after a refusal.
 */
export const useLiveCalculation = (
  form: CalcInputPayload,
  products: readonly ProductTypeRow[],
) => {
  const [calculated, setCalculated] = useState<Calculated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Wait for the products: a rise-priced one sends its rise only once known.
    if (products.length === 0 || calculated?.form === form) {
      return;
    }
    let current = true;
    const calculate = async () => {
      try {
        const result = await calculateSpecs(toRequest(form, products));
        if (current) {
          setCalculated({ form, result });
          setError(null);
        }
      } catch (err) {
        if (current) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Calculation request failed',
          );
        }
      }
    };
    const timer = setTimeout(() => void calculate(), 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [form, products, calculated, attempt]);
  return {
    calculated,
    setCalculated,
    error,
    /** The figures on screen are not yet this lift's. */
    updating: error === null && calculated?.form !== form,
    retry: () => setAttempt((n) => n + 1),
  };
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

/** A load or head count typed on the specification belongs to the lift it was typed for. */
const NAMES_THE_LIFT: readonly NumberKey[] = [
  'shaftWidthMm',
  'shaftDepthMm',
  'capacityKg',
];

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
  passengerShaft,
}: {
  form: CalcInputPayload;
  setForm: Dispatch<SetStateAction<CalcInputPayload>>;
  products: readonly ProductTypeRow[];
  /** The page's, so a product chosen by its project shares it (see withProduct). */
  passengerShaft: { current: PassengerShaft | null };
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
            setForm((prev) => ({
              ...prev,
              [key]: Number(raw),
              ...(NAMES_THE_LIFT.includes(key)
                ? {
                    capacityKgOverride: undefined,
                    capacityPersonsOverride: undefined,
                  }
                : {}),
            }));
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
            setForm(withProduct(form, e.target.value, products, passengerShaft))
          }
        >
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        {/* The escalator's rates are 0 too, but its rise moves the price. */}
        {!usesRise(products, form.productType) &&
          products.some(
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
            the floors — the company&apos;s standard passenger table. Edit on
            the specifications changes the persons and load printed.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {standard ? null : (
          <>
            {VEHICLE_STANDARD[form.productType]
              ? numberField(
                  'shaftWidthMm',
                  form.productType === 'ESCALATOR'
                    ? 'Width (mm)'
                    : 'Shaft width (mm)',
                )
              : null}
            {VEHICLE_STANDARD[form.productType]?.shaftDepthMm !== undefined
              ? numberField('shaftDepthMm', 'Shaft depth (mm)')
              : null}
            {VEHICLE_STANDARD[form.productType]?.ratedLoad === false
              ? null
              : numberField('capacityKg', 'Capacity (kg)')}
            {numberField('stops', 'Stops')}
            {usesRise(products, form.productType)
              ? numberField('travelHeightM', 'Rise (m)')
              : null}
            {numberField('speedMs', 'Speed (m/s)')}
            {hasDoor(form.productType)
              ? numberField('doorWidthMm', 'Door width (mm)')
              : null}
          </>
        )}
      </div>

      {hasMachineRoom(form.productType) ? (
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
      ) : null}

      {standard || !hasDoor(form.productType) ? null : (
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
  onEditCapacity,
  onEditingChange,
}: {
  result: CalcResult;
  products: readonly ProductTypeRow[];
  /** Recalculates with the edited figures, throwing if the API refuses them. Without it there is no Edit. */
  onEditCapacity?: (edit: CapacityEdit) => Promise<void>;
  /** Told while the figures are open for editing, so nothing saves the lift without them. */
  onEditingChange?: (editing: boolean) => void;
}) => {
  const [opened, setOpened] = useState<
    (CapacityFigures & { of: CalcResult }) | null
  >(null);
  // Typed over the result it was opened on; a recalculation closes it.
  const draft = opened?.of === result ? opened : null;
  const setDraft = (figures: CapacityFigures | null) =>
    setOpened(figures && { ...figures, of: result });
  const editing = draft !== null;
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const standard = result.input.floors !== undefined;
  const shown = {
    kg: String(result.input.capacityKg),
    persons: String(result.technical.capacityPersons ?? ''),
  };
  // A standard lift's load is printed over the table's and never priced;
  // anywhere else the load is the priced capacity, typed with the lift.
  const editable: Partial<Record<string, 'kg' | 'persons'>> = standard
    ? { Persons: 'persons', 'Rated load (kg)': 'kg' }
    : { Persons: 'persons' };
  const canEdit =
    onEditCapacity !== undefined &&
    result.input.capacityKg > 0 &&
    (standard ||
      isVehicleProduct(result.technical.productType) ||
      result.technical.carWidthMm !== null);

  const save = async (typed: CapacityFigures) => {
    const edit = capacityEdit(typed, shown, standard);
    if ('error' in edit) {
      setEditError(edit.error);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await onEditCapacity?.(edit);
      setDraft(null);
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : 'Calculation request failed',
      );
    } finally {
      setSaving(false);
    }
  };

  const cell = ([k, v]: readonly [string, string]) => {
    const key = editable[k];
    return (
      <div key={k}>
        <dt className="text-xs text-slate-500">{k}</dt>
        <dd className="font-medium text-slate-900">
          {draft && key ? (
            <NumberInput
              className={field}
              ariaLabel={k}
              value={draft[key]}
              placeholder="Calculated"
              onValueChange={(raw) => setDraft({ ...draft, [key]: raw })}
            />
          ) : (
            v
          )}
        </dd>
      </div>
    );
  };

  return (
    <>
      <section className="rounded-2xl bg-navy-800 p-6 text-white">
        <p className="text-sm text-navy-100/70">List price</p>
        <p className="font-display mt-1 text-3xl font-bold tracking-tight text-gold-400">
          {/* The sheet's own figure, VAT in — what the customer pays. The
            quotation shows the net and the VAT it splits into. */}
          {formatMoney(
            result.pricing.listVatIncluded
              ? sumEtb([
                  result.pricing.totalBeforeMargin,
                  result.pricing.listVatIncluded,
                ])
              : result.pricing.totalBeforeMargin,
          )}
        </p>
        <p className="mt-2 text-xs text-navy-100/60">
          {result.pricing.listVatIncluded
            ? "VAT included, as on the company's price sheet."
            : 'The quotation adds VAT at the statutory rate.'}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Technical specifications
          </h2>
          {canEdit && draft === null ? (
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setEditError(null);
                setDraft(shown);
              }}
            >
              Edit
            </button>
          ) : null}
        </div>
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
              ).map(cell)}
            </dl>
          </>
        ) : isVehicleProduct(result.technical.productType) ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ...(result.input.capacityKg > 0
                ? [
                    [
                      'Rated load (kg)',
                      formatNumber(result.input.capacityKg),
                    ] as const,
                  ]
                : []),
              // A car lift carries no persons until some are typed.
              ...(result.technical.capacityPersons !== null || draft
                ? [
                    [
                      'Persons',
                      formatNumber(result.technical.capacityPersons),
                    ] as const,
                  ]
                : []),
              ['Speed (m/s)', String(result.input.speedMs)] as const,
              ...(result.technical.carWidthMm !== null
                ? [
                    [
                      'Platform W×D (mm)',
                      `${formatNumber(result.technical.carWidthMm)} × ${formatNumber(result.technical.carDepthMm)}`,
                    ] as const,
                  ]
                : []),
              ...(hasDoor(result.technical.productType)
                ? [['Door (mm)', doorLabel(result.input)] as const]
                : []),
              [
                result.technical.shaftDepthMm === null
                  ? 'Width (mm)'
                  : 'Shaft W×D (mm)',
                result.technical.shaftDepthMm === null
                  ? formatNumber(result.technical.shaftWidthMm)
                  : `${formatNumber(result.technical.shaftWidthMm)} × ${formatNumber(result.technical.shaftDepthMm)}`,
              ] as const,
              ['Stops', formatNumber(result.input.stops)] as const,
              [
                result.technical.productType === 'ESCALATOR'
                  ? 'Rise (mm)'
                  : 'Travel (mm)',
                formatNumber(Math.round(result.input.travelHeightM * 1000)),
              ] as const,
            ].map(cell)}
          </dl>
        ) : result.technical.carWidthMm === null ? (
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
            ).map(cell)}
          </dl>
        )}
        {draft ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-500">
              What you type prints on the specification and the quotation; the
              price does not change. Clear a box to go back to the calculated
              figure.
            </p>
            {editError ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {editError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={saving}
                onClick={() => void save(draft)}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {result.notes.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
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
          Edit the formula under Settings → Pricing, or per product under
          Products &amp; prices.
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
              // The headline is the list, VAT in; with VAT divided out this
              // row is the net, and two "List price" figures read as one.
              [
                result.pricing.listVatIncluded ? 'Net of VAT' : 'List price',
                result.pricing.totalBeforeMargin,
              ],
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
};
