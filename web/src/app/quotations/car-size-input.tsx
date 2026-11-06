'use client';

import { Fragment } from 'react';

import { NumberInput } from './number-input';

export type CarPart = 'Width' | 'Depth' | 'Height';

const PARTS: readonly (readonly [CarPart, string])[] = [
  ['Width', 'W'],
  ['Depth', 'D'],
  ['Height', 'CH'],
];

/**
 * A car's size as one field that reads the way it prints: W 1,350 × D 1,400 ×
 * CH 2,400. Three separate boxes said nothing about which figure was which.
 * The letters are labels, so pressing one lands in its number. Where the
 * field is too narrow for a letter beside its number, as on a phone, the letter
 * sits above it, or 2,400 would be cut to 2,40.
 */
export const CarSizeInput = ({
  id,
  value,
  onChange,
  disabled = false,
}: {
  /** On the width, for a surrounding label to point at. */
  id?: string;
  value: Readonly<Record<CarPart, string>>;
  onChange: (part: CarPart, raw: string) => void;
  disabled?: boolean;
}) => (
  <div className="@container w-full max-w-76">
    <div
      role="group"
      aria-label="Car size in millimetres"
      className={`flex items-center rounded-lg border border-slate-300 bg-white p-0.5 ${disabled ? 'opacity-60' : ''}`}
    >
      {PARTS.map(([part, letter], index) => (
        <Fragment key={part}>
          {index > 0 ? (
            <span aria-hidden="true" className="shrink-0 text-slate-400 @[19rem]:px-0.5">
              ×
            </span>
          ) : null}
          <label className="flex min-w-0 flex-1 cursor-text flex-col rounded-md px-1.5 py-1 transition-colors hover:bg-slate-50 focus-within:bg-gold-400/15 focus-within:ring-2 focus-within:ring-gold-500 @[19rem]:flex-row @[19rem]:items-baseline @[19rem]:gap-1.5 @[19rem]:px-2 @[19rem]:py-1.5">
            <span className="text-xs font-semibold text-slate-500">
              {letter}
            </span>
            <NumberInput
              id={index === 0 ? id : undefined}
              ariaLabel={`Car ${part.toLowerCase()} (mm)`}
              disabled={disabled}
              placeholder="—"
              value={value[part]}
              onValueChange={(raw) => onChange(part, raw)}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
        </Fragment>
      ))}
    </div>
  </div>
);
