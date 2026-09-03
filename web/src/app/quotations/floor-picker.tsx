'use client';

import {
  composeFloorLabels,
  decomposeFloorLabels,
  MAX_UPPER_FLOOR,
  SPECIAL_FLOORS,
  toggleUpperFloor,
} from './floor-plan';

/**
 * Picks the landings a lift stops at, by clicking rather than typing.
 *
 * This replaced a text box asking for "B,G,M,1,2,3,4,5,6,7,8,9,10". Thirteen
 * labels, typed by hand, on the field that decides the stop count, the price,
 * and two rows of the printed specification — a comma in the wrong place was
 * a wrong quotation.
 *
 * Clicking an upper floor selects everything below it, because a lift that
 * stops at the 10th stops at the 9th; clicking a selected one removes just
 * that floor, which is how you say "no 13th". Both behaviours live in
 * `toggleUpperFloor`, tested there.
 *
 * `floorLabels` stays the stored value and the single source of truth — the
 * chips only compose it. A saved line whose labels the chips cannot express
 * (an "LG", a 45th floor) keeps the text field instead, so nothing is ever
 * silently dropped.
 */
export const FloorPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (floorLabels: string) => void;
  disabled?: boolean;
}) => {
  const { specials, upper, custom } = decomposeFloorLabels(value);

  if (custom.length > 0) {
    return (
      <div className="space-y-1.5">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <p className="text-xs text-slate-500">
          Typed in full because {custom.join(', ')}{' '}
          {custom.length === 1 ? 'is not' : 'are not'} on the picker. Clear the
          field to go back to choosing.
        </p>
      </div>
    );
  }

  const chip = (active: boolean): string =>
    `rounded-md border px-2.5 py-1 font-mono text-xs transition ${
      active
        ? 'border-navy-800 bg-navy-800 text-white'
        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
    } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`;

  const setSpecials = (next: string[]): void =>
    onChange(composeFloorLabels(next, upper));

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Below ground &amp; named
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SPECIAL_FLOORS.map((floor) => {
            const active = specials.includes(floor);
            return (
              <button
                key={floor}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() =>
                  setSpecials(
                    active
                      ? specials.filter((item) => item !== floor)
                      : [...specials, floor],
                  )
                }
                className={chip(active)}
              >
                {floor}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Upper floors
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
            picking one takes every floor below it
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: MAX_UPPER_FLOOR }, (_, index) => index + 1).map(
            (floor) => {
              const active = upper.includes(floor);
              return (
                <button
                  key={floor}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  aria-label={`Floor ${floor}`}
                  onClick={() =>
                    onChange(
                      composeFloorLabels(specials, toggleUpperFloor(upper, floor)),
                    )
                  }
                  className={chip(active)}
                >
                  {floor}
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
};
