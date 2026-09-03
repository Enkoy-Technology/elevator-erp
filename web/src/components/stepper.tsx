'use client';

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { btnGhost } from './form-styles';

export interface Step {
  id: string;
  label: string;
  /** The one line that says what this step currently holds — "1 lift",
   *  "7,835,000 ETB", "4 milestones". Shown under the label so a glance at
   *  the rail answers "what have I already done" without opening anything. */
  summary?: string | null;
  /** Ticked on the rail. "Has something in it", not "has been visited". */
  done?: boolean;
  /** Marked in red. The step still opens — you cannot fix what you cannot see. */
  invalid?: boolean;
}

/**
 * A long form split into steps, showing one at a time.
 *
 * Navigation is FREE, not sequential: every step is clickable from every
 * other. These forms edit a record that already exists, so refusing to show
 * step 3 until step 2 "passes" would only stop someone correcting a typo
 * they already spotted. The rail reports state; it does not police it.
 *
 * All panels' state must live in the PARENT, not in the panels, because
 * hiding a step unmounts it. Keeping it here is what lets someone fill in the
 * terms, jump back to check a price, and return to find their typing intact.
 */
export const Stepper = ({
  steps,
  currentId,
  onStepChange,
  children,
}: {
  steps: readonly Step[];
  currentId: string;
  onStepChange: (id: string) => void;
  /** The active step's panel. The caller renders whichever one matches. */
  children: ReactNode;
}) => {
  const index = steps.findIndex((step) => step.id === currentId);
  const current = index < 0 ? 0 : index;
  const previous = steps[current - 1];
  const next = steps[current + 1];

  return (
    <div className="space-y-5">
      <nav aria-label="Form steps">
        <ol className="flex flex-wrap gap-2">
          {steps.map((step, position) => {
            const active = position === current;
            return (
              <li key={step.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-gold-500 bg-white ring-1 ring-gold-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      step.invalid
                        ? 'bg-red-600 text-white'
                        : step.done
                          ? 'bg-emerald-600 text-white'
                          : active
                            ? 'bg-navy-800 text-white'
                            : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {step.done && !step.invalid ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      position + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-xs font-semibold ${
                        active ? 'text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span
                      className={`block truncate text-[11px] ${
                        step.invalid ? 'text-red-700' : 'text-slate-500'
                      }`}
                    >
                      {step.summary ?? '—'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {children}

      <div className="flex items-center justify-between gap-3">
        {previous ? (
          <button
            type="button"
            onClick={() => onStepChange(previous.id)}
            className={`${btnGhost} inline-flex items-center gap-1`}
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            {previous.label}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button
            type="button"
            onClick={() => onStepChange(next.id)}
            className={`${btnGhost} inline-flex items-center gap-1`}
          >
            {next.label}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
};
