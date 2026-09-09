'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';

import { btnPrimary, btnSecondary, metaLabelClass } from './form-styles';
import { BackLink } from './page-header';
import { Sidebar } from './sidebar';

/** Header text and the form share this column, so nothing sits alone at the left edge of a wide screen. */
const COLUMN = 'mx-auto w-full max-w-3xl';

/**
 * The shell every create/edit form sits in, now that forms are their own
 * routes rather than a right-side overlay.
 *
 * One component owns the frame — back control, title, error banner, the
 * centred column, and a footer whose actions stay put while a long form
 * scrolls — so that filling in a customer and filling in a maintenance
 * contract are the same experience rather than eight approximations of one.
 *
 * The single column is deliberate: these are data-entry forms, and a
 * two-column form makes the eye jump and the tab order ambiguous. Group
 * related fields with `FormSection` instead of adding a second column.
 */
export const FormPage = ({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  error,
  submitting = false,
  submitDisabled = false,
  submitLabel,
  onSubmit,
  children,
  secondaryAction,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Where Cancel and the back control go — the list or record this form belongs to. */
  backHref: string;
  backLabel: string;
  error?: string | null;
  submitting?: boolean;
  /** Locked record: Save is dead, Cancel still works. Unlike `submitting`,
   *  which means a save is in flight and disables both. */
  submitDisabled?: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
  /** e.g. a Delete button on an edit form. Sits on the left, away from Save. */
  secondaryAction?: ReactNode;
}) => {
  const router = useRouter();

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
          <div className={COLUMN}>
            <BackLink href={backHref} label={backLabel} />
            {eyebrow ? <p className={`mb-1.5 ${metaLabelClass}`}>{eyebrow}</p> : null}
            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col">
          <div className={`${COLUMN} flex-1 px-4 py-6 sm:px-8`}>
            {error ? (
              <p
                role="alert"
                className="mb-5 rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </p>
            ) : null}

            <div className="space-y-5">{children}</div>
          </div>

          {/* Sticky so the save action is reachable without scrolling to the
              bottom of a long form. Opaque, ruled and shadowed so it reads as a
              bar sitting above the page rather than a card cut in half. */}
          <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className={`${COLUMN} flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-8`}>
              <div>{secondaryAction}</div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => router.push(backHref)}
                  className={btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || submitDisabled}
                  className={btnPrimary}
                >
                  {submitting ? 'Saving…' : submitLabel}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

/** A titled group of fields. The only sanctioned way to break up a form. */
export const FormSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-3.5 sm:px-6">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
    </div>
    <div className="grid gap-x-5 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">{children}</div>
  </section>
);

/** One labelled control. `wide` spans both columns of a FormSection. */
export const Field = ({
  label,
  htmlFor,
  hint,
  wide = false,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) => (
  <div className={wide ? 'sm:col-span-2' : undefined}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {label}
    </label>
    {children}
    {hint ? <p className="mt-1.5 text-xs leading-snug text-slate-500">{hint}</p> : null}
  </div>
);
