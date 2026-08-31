'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';

import { btnPrimary, btnSecondary } from './form-styles';
import { Sidebar } from './sidebar';

/**
 * The shell every create/edit form sits in, now that forms are their own
 * routes rather than a right-side overlay.
 *
 * One component owns the frame — back link, title, error banner, the
 * fieldset column width, and a footer whose actions stay put while a long
 * form scrolls — so that filling in a customer and filling in a maintenance
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
  submitLabel,
  onSubmit,
  children,
  secondaryAction,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Where Cancel and the back link go — the list this form belongs to. */
  backHref: string;
  backLabel: string;
  error?: string | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
  /** e.g. a Delete button on an edit form. */
  secondaryAction?: ReactNode;
}) => {
  const router = useRouter();

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-6 py-4 sm:px-8">
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
          {eyebrow ? (
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
          ) : null}
        </header>

        <form onSubmit={onSubmit} className="px-6 py-6 sm:px-8">
          {error ? (
            <p
              role="alert"
              className="mb-5 max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          <div className="max-w-2xl space-y-6">{children}</div>

          {/* Sticky so the save action is reachable without scrolling to the
              bottom of a long form — the one thing the overlay drawer did
              well, kept. */}
          <div className="sticky bottom-0 mt-8 flex max-w-2xl flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-100/95 py-4 backdrop-blur">
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => router.push(backHref)}
              className={btnSecondary}
            >
              Cancel
            </button>
            <div className="ml-auto">{secondaryAction}</div>
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
  <section className="rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {title}
    </h2>
    {description ? (
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    ) : null}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
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
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-semibold text-slate-600"
    >
      {label}
    </label>
    {children}
    {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
  </div>
);
