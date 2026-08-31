'use client';

import { Search, X, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { fieldClass } from './form-styles';

/**
 * The bar above every list: search on the left, filters next to it, actions
 * on the right. Same order, same spacing, every module — the point being
 * that someone who has used one list already knows where the controls are.
 */

export const ListToolbar = ({
  search,
  filters,
  actions,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
    <div className="flex flex-wrap items-end gap-3">
      {search}
      {filters}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

/**
 * A labelled dropdown. Replaces the row-of-pills pattern that was spreading
 * across the list pages: pills cost one line per option and stop fitting
 * the moment a status set grows past four, which every status set here has.
 *
 * A plain <select> on purpose — it is keyboard- and screen-reader-correct
 * for free, renders as the native picker on a phone, and needs no library.
 */
export const FilterSelect = <T extends string>({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  label: string;
  value: T | '';
  onChange: (value: T | '') => void;
  options: readonly { value: T; label: string }[];
  /** Text for the unfiltered choice. Never a blank line in the list. */
  allLabel?: string;
}) => {
  const id = useId();
  return (
    <div className="min-w-[11rem]">
      <label
        htmlFor={id}
        className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
      >
        {label}
      </label>
      <select
        id={id}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as T | '')}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Search box with a submit and a clear affordance, sized to sit beside a
 * FilterSelect.
 *
 * `onSubmit` RECEIVES the term rather than reading it from the caller's
 * state. The clear button changes the value and submits in the same tick,
 * so a handler that read its own state would search the pre-clear term —
 * the box looks empty and the results stay filtered. Passing the value
 * makes that unrepresentable instead of something every page has to
 * remember to work around.
 */
export const SearchField = ({
  label = 'Search',
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}) => {
  const id = useId();
  return (
    <div className="min-w-[14rem]">
      <label
        htmlFor={id}
        className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
      >
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          className={`${fieldClass} pl-9 ${value ? 'pr-9' : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit(value);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange('');
              onSubmit('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
};

/** Status chip. One place decides what a status looks like across the ERP. */
export const StatusPill = ({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'active' | 'good' | 'warn' | 'danger';
}) => {
  const toneClass = {
    neutral: 'bg-slate-100 text-slate-600',
    active: 'bg-gold-500/15 text-gold-600',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
  }[tone];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${toneClass}`}
    >
      {label}
    </span>
  );
};

/**
 * An icon-only row action — Edit, Delete and friends inside a table row.
 *
 * Icon-only is a real accessibility trade: the label stops being visible, so
 * it has to come back through `aria-label` (screen readers) AND `title`
 * (a hover tooltip for everyone else). Both are required, not optional, and
 * the hit target stays 32px square rather than shrinking to the glyph.
 */
export const RowAction = ({
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  disabled = false,
}: {
  icon: LucideIcon;
  /** The verb, e.g. "Edit customer". Read aloud and shown on hover. */
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
      tone === 'danger'
        ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon aria-hidden className="h-4 w-4" />
  </button>
);
