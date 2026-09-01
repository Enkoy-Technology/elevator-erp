'use client';

import { useLayoutEffect, useRef, type ChangeEvent } from 'react';

import { fieldClass } from '@/components/form-styles';

/**
 * Every number a salesperson types on a quotation, shown grouped as they
 * type it: 7835000 reads as 7,835,000 and the eye counts the zeros without
 * being asked to. A capacity, a door width and a grand total are all
 * misread the same way ungrouped, so this is one control rather than a
 * special case for money.
 *
 * `<input type="number">` cannot do it — a browser will not render a
 * separator inside one, and it silently drops a value it cannot parse. So
 * this is a text input with `inputMode="decimal"` (still the numeric keypad
 * on a phone) that keeps the RAW digit string in state and only formats on
 * the way out.
 */

const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;
/** Digits with at most one decimal point. Negatives are not a thing here. */
const NUMERIC_RE = /^\d*(\.\d*)?$/;

/** '1234.5' -> '1,234.5'. Only the integer part is grouped. */
export const groupDigits = (raw: string): string => {
  const [whole = '', frac] = raw.split('.');
  const grouped = whole.replace(GROUP_RE, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
};

export const NumberInput = ({
  id,
  value,
  onValueChange,
  onBlur,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
}: {
  id?: string;
  /** The raw, unformatted string — '7835000', never '7,835,000'. */
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Required where there is no visible <label>, e.g. a field inside a row. */
  ariaLabel?: string;
  className?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  /** How many non-separator characters preceded the caret before we
   *  reformatted. null when this render was not caused by typing. */
  const caretAfter = useRef<number | null>(null);

  // Re-inserting separators moves the caret to the end unless we put it
  // back, which makes editing the middle of a number impossible. Counting
  // in non-separator characters rather than absolute offsets is what
  // survives a comma appearing or disappearing to the left of the caret.
  useLayoutEffect(() => {
    const el = ref.current;
    const target = caretAfter.current;
    caretAfter.current = null;
    if (!el || target === null) {
      return;
    }
    let seen = 0;
    let position = el.value.length;
    for (let i = 0; i < el.value.length; i += 1) {
      if (seen === target) {
        position = i;
        break;
      }
      if (el.value[i] !== ',') {
        seen += 1;
      }
    }
    el.setSelectionRange(position, position);
  });

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    const caret = el.selectionStart ?? el.value.length;
    const next = el.value.replace(/,/g, '');
    if (!NUMERIC_RE.test(next)) {
      // React will not re-render (state is unchanged), so the rejected
      // character would otherwise stay sitting in the DOM.
      el.value = groupDigits(value);
      el.setSelectionRange(caret - 1, caret - 1);
      return;
    }
    caretAfter.current = el.value.slice(0, caret).replace(/,/g, '').length;
    onValueChange(next);
  };

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={groupDigits(value)}
      onChange={onChange}
      onBlur={onBlur}
      className={`${className ?? fieldClass} tabular-nums`}
    />
  );
};
