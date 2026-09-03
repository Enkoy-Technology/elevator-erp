'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Field } from '@/components/form-page';
import { btnGhost, btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import {
  ApiError,
  addQuotationLine,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  removeQuotationLine,
  reorderQuotationLines,
  updateQuotationLine,
  type CreateQuotationLinePayload,
  type ProductType,
  type QuotationLine,
} from '@/lib/api';
import { formatEtb } from '@/lib/money';

import { describeFloorPlan } from '../../floor-plan';
import { NumberInput } from '../../number-input';

/**
 * Page 1 of the client's proforma is a line table with a "No of Units"
 * column: one quotation sells three lifts of two specs. So a quotation is
 * edited as LINES here, each carrying its own duty parameters (which the
 * frozen calculator prices) and its own page-2 spec sheet.
 *
 * Lines save one at a time through their own endpoint rather than with the
 * enclosing form, because the calculator runs server-side — a line has to
 * round-trip before anyone can see what it costs. Same reason the contract
 * instalment editor owns its own Save.
 */

/** Everything a line holds, as strings — what the inputs actually carry. */
interface LineDraft {
  productType: ProductType;
  capacityKg: string;
  stops: string;
  travelHeightM: string;
  speedMs: string;
  machineRoomType: 'MR' | 'MRL';
  doorType: 'CENTER_OPEN' | 'TELESCOPIC' | 'SWING';
  doorWidthMm: string;
  buildingUsage: 'RESIDENTIAL' | 'COMMERCIAL' | 'HOSPITAL' | 'INDUSTRIAL';
  marginPercent: string;
  quantity: string;
  machineRoomLabel: string;
  floorLabels: string;
  doorHeightMm: string;
  ropingRatio: string;
  tractionMachineType: string;
  controlSystem: string;
  powerSupply: string;
  lightSupply: string;
  entranceCount: string;
  specSummary: string;
}

/**
 * The spec-sheet half is prefilled from the client's own proforma rather
 * than left blank: those ten rows are the same on nine quotes out of ten,
 * and a blank field is what made them paste boilerplate that then drifted
 * (their page 2 says Simplex where page 3 says Duplex). Typed-over when
 * a lift is genuinely different, ignored otherwise.
 */
export const NEW_LINE: LineDraft = {
  productType: 'PASSENGER',
  capacityKg: '1000',
  stops: '12',
  travelHeightM: '45',
  speedMs: '1.6',
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: '900',
  buildingUsage: 'COMMERCIAL',
  marginPercent: '25',
  quantity: '1',
  machineRoomLabel: 'MRL',
  floorLabels: '',
  doorHeightMm: '2100',
  ropingRatio: '2:1',
  tractionMachineType: 'Gearless',
  controlSystem: 'Simplex',
  powerSupply: '380V AC 50HZ 3-phase 4 lines',
  lightSupply: '240V AC 50HZ Single phase',
  entranceCount: '1',
  specSummary: '',
};

const str = (value: number | string | null | undefined, fallback = ''): string =>
  value === null || value === undefined ? fallback : String(value);

const toDraft = (line: QuotationLine): LineDraft => {
  const calc = line.calcInput;
  return {
    productType: line.productType,
    capacityKg: str(calc?.capacityKg, NEW_LINE.capacityKg),
    stops: str(calc?.stops, NEW_LINE.stops),
    travelHeightM: str(calc?.travelHeightM, NEW_LINE.travelHeightM),
    speedMs: str(calc?.speedMs, NEW_LINE.speedMs),
    machineRoomType: calc?.machineRoomType ?? NEW_LINE.machineRoomType,
    doorType: calc?.doorType ?? NEW_LINE.doorType,
    doorWidthMm: str(calc?.doorWidthMm, NEW_LINE.doorWidthMm),
    buildingUsage: calc?.buildingUsage ?? NEW_LINE.buildingUsage,
    marginPercent: str(calc?.marginPercent, NEW_LINE.marginPercent),
    quantity: str(line.quantity, '1'),
    machineRoomLabel: str(line.machineRoomLabel),
    floorLabels: str(line.floorLabels),
    doorHeightMm: str(line.doorHeightMm),
    ropingRatio: str(line.ropingRatio),
    tractionMachineType: str(line.tractionMachineType),
    controlSystem: str(line.controlSystem),
    powerSupply: str(line.powerSupply),
    lightSupply: str(line.lightSupply),
    entranceCount: str(line.entranceCount),
    specSummary: str(line.specSummary),
  };
};

const num = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : fallback;
};

/** Blank means "leave it alone": the API's validators reject null on every
 *  spec field, so an empty box omits the key instead of blanking it. */
const text = (value: string): string | undefined =>
  value.trim() === '' ? undefined : value.trim();

const toPayload = (draft: LineDraft): CreateQuotationLinePayload => {
  const floorLabels = text(draft.floorLabels);
  return {
    productType: draft.productType,
    capacityKg: num(draft.capacityKg, 1000),
    travelHeightM: num(draft.travelHeightM, 1),
    speedMs: num(draft.speedMs, 1),
    machineRoomType: draft.machineRoomType,
    doorType: draft.doorType,
    doorWidthMm: num(draft.doorWidthMm, 900),
    buildingUsage: draft.buildingUsage,
    marginPercent: num(draft.marginPercent, 0),
    quantity: num(draft.quantity, 1),
    // Floors win where they are given — their count IS the stop count, and
    // sending both invites the two to disagree.
    ...(floorLabels ? { floorLabels } : { stops: num(draft.stops, 2) }),
    machineRoomLabel: text(draft.machineRoomLabel),
    doorHeightMm: draft.doorHeightMm.trim()
      ? num(draft.doorHeightMm, 2100)
      : undefined,
    ropingRatio: text(draft.ropingRatio),
    tractionMachineType: text(draft.tractionMachineType),
    controlSystem: text(draft.controlSystem),
    powerSupply: text(draft.powerSupply),
    lightSupply: text(draft.lightSupply),
    entranceCount: draft.entranceCount.trim()
      ? num(draft.entranceCount, 1)
      : undefined,
    specSummary: text(draft.specSummary),
  };
};

const message = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

export const LinesEditor = ({
  quotationId,
  lines,
  onLinesChange,
  editable,
}: {
  quotationId: string;
  lines: QuotationLine[];
  onLinesChange: (lines: QuotationLine[]) => void;
  /** DRAFT only — mirrors the API's own gate on every line endpoint. */
  editable: boolean;
}) => {
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  // A lift with no floors yet has never been described — it is the
  // placeholder the create screen opened the quotation with, so open it
  // rather than making someone hunt for the one row that needs work.
  const [openId, setOpenId] = useState<string | null>(
    () => lines.find((line) => !line.floorLabels)?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftFor = (line: QuotationLine): LineDraft =>
    drafts[line.id] ?? toDraft(line);

  const setField = <K extends keyof LineDraft>(
    line: QuotationLine,
    field: K,
    value: LineDraft[K],
  ) => {
    const next = { ...draftFor(line), [field]: value };
    setDrafts((prev) => ({ ...prev, [line.id]: next }));
  };

  const isDirty = (line: QuotationLine): boolean => {
    const draft = drafts[line.id];
    return draft !== undefined && JSON.stringify(draft) !== JSON.stringify(toDraft(line));
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const addLift = () =>
    void run(async () => {
      // Copying the last lift is the right default: a tower is usually two
      // or three of nearly the same machine, and retyping nineteen fields
      // to change the capacity is the burden this screen exists to remove.
      const seed = lines.length > 0 ? draftFor(lines[lines.length - 1]) : NEW_LINE;
      const created = await addQuotationLine(quotationId, toPayload(seed));
      onLinesChange([...lines, created]);
      setOpenId(created.id);
    }, 'Failed to add the lift');

  const saveLine = (line: QuotationLine) =>
    void run(async () => {
      const saved = await updateQuotationLine(
        quotationId,
        line.id,
        toPayload(draftFor(line)),
      );
      onLinesChange(lines.map((l) => (l.id === line.id ? saved : l)));
      setDrafts((prev) => {
        const { [line.id]: _dropped, ...rest } = prev;
        return rest;
      });
    }, 'Failed to save the lift');

  const deleteLine = (line: QuotationLine) =>
    void run(async () => {
      onLinesChange(await removeQuotationLine(quotationId, line.id));
      setDrafts((prev) => {
        const { [line.id]: _dropped, ...rest } = prev;
        return rest;
      });
    }, 'Failed to remove the lift');

  const move = (index: number, delta: number) =>
    void run(async () => {
      const order = lines.map((l) => l.id);
      const target = index + delta;
      [order[index], order[target]] = [order[target], order[index]];
      onLinesChange(await reorderQuotationLines(quotationId, order));
    }, 'Failed to reorder the lifts');

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className={labelClass}>Lifts on this offer</h2>
        {editable ? (
          <button
            type="button"
            disabled={busy}
            onClick={addLift}
            className="text-xs font-semibold text-navy-800 hover:underline disabled:opacity-40"
          >
            + Add lift
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {editable
          ? 'One row per lift, in the order they print. A new lift starts as a copy of the one above it — change what differs. Each lift is priced by the calculator the moment you save it.'
          : 'This quotation has left DRAFT, so its lifts can no longer be changed.'}
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {lines.length === 0 ? (
          <p className="text-sm text-slate-500">No lifts yet — add the first one.</p>
        ) : null}

        {lines.map((line, index) => {
          const draft = draftFor(line);
          const open = openId === line.id;
          const plan = describeFloorPlan(draft.floorLabels, num(draft.entranceCount, 1));
          const dirty = isDirty(line);

          return (
            <div key={line.id} className="rounded-lg border border-slate-200">
              {/* The always-visible row: what a salesperson scans before
                  deciding which lift they came here to change. */}
              <div className="flex items-center gap-2 p-3">
                <span className="font-mono text-xs text-slate-400">{line.sequence}</span>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : line.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {open ? (
                    <ChevronUp aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {line.specSummary ??
                        `${PRODUCT_TYPE_LABELS[line.productType]} — ${draft.capacityKg}kg`}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {draft.quantity} unit{num(draft.quantity, 1) === 1 ? '' : 's'}
                      {plan ? ` · ${plan.displaySummary} · ${plan.floorsStopsDoors}` : ''}
                      {dirty ? ' · unsaved' : ''}
                    </span>
                  </span>
                </button>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-navy-800">
                  {line.lineTotalEtb ? formatEtb(line.lineTotalEtb) : '—'}
                </span>
                {editable ? (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move lift ${line.sequence} up`}
                      title="Move up"
                      className={`${btnGhost} px-1.5 disabled:opacity-25`}
                    >
                      <ChevronUp aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === lines.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move lift ${line.sequence} down`}
                      title="Move down"
                      className={`${btnGhost} px-1.5 disabled:opacity-25`}
                    >
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || lines.length === 1}
                      onClick={() => deleteLine(line)}
                      aria-label={`Remove lift ${line.sequence}`}
                      title={
                        lines.length === 1
                          ? 'A quotation needs at least one lift'
                          : 'Remove this lift'
                      }
                      className={`${btnGhost} px-1.5 text-slate-400 hover:text-red-600 disabled:opacity-25`}
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </span>
                ) : null}
              </div>

              {open ? (
                <div className="border-t border-slate-200 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Product" htmlFor={`product-${line.id}`} wide>
                      <select
                        id={`product-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        value={draft.productType}
                        onChange={(e) =>
                          setField(line, 'productType', e.target.value as ProductType)
                        }
                      >
                        {PRODUCT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {PRODUCT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="No of units" htmlFor={`qty-${line.id}`}>
                      <NumberInput
                        id={`qty-${line.id}`}
                        disabled={!editable}
                        value={draft.quantity}
                        onValueChange={(v) => setField(line, 'quantity', v)}
                      />
                    </Field>
                    <Field label="Capacity (kg)" htmlFor={`cap-${line.id}`}>
                      <NumberInput
                        id={`cap-${line.id}`}
                        disabled={!editable}
                        value={draft.capacityKg}
                        onValueChange={(v) => setField(line, 'capacityKg', v)}
                      />
                    </Field>

                    <Field
                      label="Floors served"
                      htmlFor={`floors-${line.id}`}
                      wide
                      // The empty hint has to TEACH the notation, not repeat
                      // the placeholder: B/G/M are not obvious, and this one
                      // field is what produces the stop count, the "B+G+M+10"
                      // on page 1 and the "13/13/13" on the spec sheet.
                      hint={
                        plan
                          ? `${plan.stops} landings · prints as ${plan.displaySummary} · ${plan.floorsStopsDoors} floors/stops/doors`
                          : 'Every landing the lift stops at, bottom to top. B = basement, G = ground, M = mezzanine, then the numbered floors.'
                      }
                    >
                      <input
                        id={`floors-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="B,G,M,1,2,3,4,5,6,7,8,9,10"
                        value={draft.floorLabels}
                        onChange={(e) => setField(line, 'floorLabels', e.target.value)}
                      />
                    </Field>

                    <Field
                      label="Stops"
                      htmlFor={`stops-${line.id}`}
                      hint={plan ? 'Counted from the floors above.' : undefined}
                    >
                      <NumberInput
                        id={`stops-${line.id}`}
                        disabled={!editable || plan !== null}
                        value={plan ? String(plan.stops) : draft.stops}
                        onValueChange={(v) => setField(line, 'stops', v)}
                      />
                    </Field>
                    <Field label="Entrances per stop" htmlFor={`entrances-${line.id}`}>
                      <NumberInput
                        id={`entrances-${line.id}`}
                        disabled={!editable}
                        value={draft.entranceCount}
                        onValueChange={(v) => setField(line, 'entranceCount', v)}
                      />
                    </Field>

                    <Field label="Travel height (m)" htmlFor={`travel-${line.id}`}>
                      <NumberInput
                        id={`travel-${line.id}`}
                        disabled={!editable}
                        value={draft.travelHeightM}
                        onValueChange={(v) => setField(line, 'travelHeightM', v)}
                      />
                    </Field>
                    <Field label="Speed (m/s)" htmlFor={`speed-${line.id}`}>
                      <NumberInput
                        id={`speed-${line.id}`}
                        disabled={!editable}
                        value={draft.speedMs}
                        onValueChange={(v) => setField(line, 'speedMs', v)}
                      />
                    </Field>

                    <Field label="Machine room" htmlFor={`mr-${line.id}`}>
                      <select
                        id={`mr-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        value={draft.machineRoomType}
                        onChange={(e) => {
                          const machineRoomType = e.target.value as 'MR' | 'MRL';
                          setDrafts((prev) => ({
                            ...prev,
                            [line.id]: {
                              ...draftFor(line),
                              machineRoomType,
                              // The printed label follows the choice unless
                              // someone has worded it themselves.
                              machineRoomLabel:
                                draftFor(line).machineRoomLabel === '' ||
                                draftFor(line).machineRoomLabel === 'MRL' ||
                                draftFor(line).machineRoomLabel === 'WITH MR'
                                  ? machineRoomType === 'MRL'
                                    ? 'MRL'
                                    : 'WITH MR'
                                  : draftFor(line).machineRoomLabel,
                            },
                          }));
                        }}
                      >
                        <option value="MRL">MRL (machine-room-less)</option>
                        <option value="MR">With machine room</option>
                      </select>
                    </Field>
                    <Field
                      label="Machine room label"
                      htmlFor={`mrl-${line.id}`}
                      hint="As printed on the spec sheet."
                    >
                      <input
                        id={`mrl-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="MRL"
                        value={draft.machineRoomLabel}
                        onChange={(e) => setField(line, 'machineRoomLabel', e.target.value)}
                      />
                    </Field>

                    <Field label="Door type" htmlFor={`doortype-${line.id}`}>
                      <select
                        id={`doortype-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        value={draft.doorType}
                        onChange={(e) =>
                          setField(line, 'doorType', e.target.value as LineDraft['doorType'])
                        }
                      >
                        <option value="CENTER_OPEN">Center open</option>
                        <option value="TELESCOPIC">Telescopic</option>
                        <option value="SWING">Swing</option>
                      </select>
                    </Field>
                    <Field label="Building usage" htmlFor={`usage-${line.id}`}>
                      <select
                        id={`usage-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        value={draft.buildingUsage}
                        onChange={(e) =>
                          setField(
                            line,
                            'buildingUsage',
                            e.target.value as LineDraft['buildingUsage'],
                          )
                        }
                      >
                        <option value="RESIDENTIAL">Residential</option>
                        <option value="COMMERCIAL">Commercial</option>
                        <option value="HOSPITAL">Hospital</option>
                        <option value="INDUSTRIAL">Industrial</option>
                      </select>
                    </Field>

                    <Field label="Door width (mm)" htmlFor={`dw-${line.id}`}>
                      <NumberInput
                        id={`dw-${line.id}`}
                        disabled={!editable}
                        value={draft.doorWidthMm}
                        onValueChange={(v) => setField(line, 'doorWidthMm', v)}
                      />
                    </Field>
                    <Field label="Door height (mm)" htmlFor={`dh-${line.id}`}>
                      <NumberInput
                        id={`dh-${line.id}`}
                        disabled={!editable}
                        value={draft.doorHeightMm}
                        onValueChange={(v) => setField(line, 'doorHeightMm', v)}
                      />
                    </Field>

                    <Field label="Roping" htmlFor={`roping-${line.id}`}>
                      <input
                        id={`roping-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="2:1"
                        value={draft.ropingRatio}
                        onChange={(e) => setField(line, 'ropingRatio', e.target.value)}
                      />
                    </Field>
                    <Field label="Traction machine" htmlFor={`traction-${line.id}`}>
                      <input
                        id={`traction-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="Gearless"
                        value={draft.tractionMachineType}
                        onChange={(e) =>
                          setField(line, 'tractionMachineType', e.target.value)
                        }
                      />
                    </Field>

                    <Field label="Control system" htmlFor={`control-${line.id}`}>
                      <input
                        id={`control-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="Simplex"
                        value={draft.controlSystem}
                        onChange={(e) => setField(line, 'controlSystem', e.target.value)}
                      />
                    </Field>
                    <Field label="Margin (%)" htmlFor={`margin-${line.id}`}>
                      <NumberInput
                        id={`margin-${line.id}`}
                        disabled={!editable}
                        value={draft.marginPercent}
                        onValueChange={(v) => setField(line, 'marginPercent', v)}
                      />
                    </Field>

                    <Field label="Power supply" htmlFor={`power-${line.id}`}>
                      <input
                        id={`power-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="380V AC 50HZ 3-phase 4 lines"
                        value={draft.powerSupply}
                        onChange={(e) => setField(line, 'powerSupply', e.target.value)}
                      />
                    </Field>
                    <Field label="Light supply" htmlFor={`light-${line.id}`}>
                      <input
                        id={`light-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="240V AC 50HZ Single phase"
                        value={draft.lightSupply}
                        onChange={(e) => setField(line, 'lightSupply', e.target.value)}
                      />
                    </Field>

                    <Field
                      label="Description on the offer"
                      htmlFor={`summary-${line.id}`}
                      wide
                      hint="Leave blank and the system writes it from the fields above."
                    >
                      <input
                        id={`summary-${line.id}`}
                        className={fieldClass}
                        disabled={!editable}
                        placeholder="800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors"
                        value={draft.specSummary}
                        onChange={(e) => setField(line, 'specSummary', e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
                    {editable ? (
                      <button
                        type="button"
                        disabled={busy || !dirty}
                        onClick={() => saveLine(line)}
                        className={`${btnSecondary} disabled:opacity-40`}
                      >
                        {busy ? 'Pricing…' : 'Save & price this lift'}
                      </button>
                    ) : null}
                    <span className="text-xs text-slate-500">
                      Calculator: {line.unitPriceEtb ? formatEtb(line.unitPriceEtb) : '—'} per
                      unit, {line.lineTotalEtb ? formatEtb(line.lineTotalEtb) : '—'} for the
                      line (ex VAT)
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};
