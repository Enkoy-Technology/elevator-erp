'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';

import { btnPrimary, btnSecondary } from './form-styles';
import { Breadcrumb } from './page-header';
import { Sidebar } from './sidebar';

/**
 * The shell every create/edit form sits in, shaped like an Odoo / ERPNext
 * form view: a control bar on top with the breadcrumb on the left and the
 * record's actions on the right, then one white sheet holding the fields.
 *
 * Inside the sheet, fields sit in two even columns with the label above
 * the control, and sections are separated by a titled rule rather than
 * boxed into cards — the sheet is the one surface. One component owns this
 * so every form in the product is the same form.
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
  /** The module this record belongs to — the root of the breadcrumb. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Where Discard and the breadcrumb's parent go — the list or record this form belongs to. */
  backHref: string;
  backLabel: string;
  error?: string | null;
  submitting?: boolean;
  /** Locked record: Save is dead, Discard still works. Unlike `submitting`,
   *  which means a save is in flight and disables both. */
  submitDisabled?: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
  /** e.g. a Delete button on an edit form. Sits with the actions, after a gap. */
  secondaryAction?: ReactNode;
}) => {
  const router = useRouter();

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col bg-slate-100">
        <form onSubmit={onSubmit} className="flex flex-1 flex-col">
          {/* Control bar: where you are, and what you can do to this record.
              Sticky so Save is never further than the top of the screen. */}
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <Breadcrumb
                  root={eyebrow}
                  parentHref={backHref}
                  parentLabel={backLabel}
                  current={title}
                />
              </div>
              <div className="flex items-center gap-2">
                {secondaryAction ? (
                  <div className="mr-2">{secondaryAction}</div>
                ) : null}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => router.push(backHref)}
                  className={btnSecondary}
                >
                  Discard
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

          <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-4xl">
              {error ? (
                <p
                  role="alert"
                  className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {error}
                </p>
              ) : null}

              {/* The sheet. The breadcrumb already names the record, so the
                  sheet opens straight on the fields; a description, when
                  given, is one quiet line above them. */}
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="px-6 py-6 sm:px-10 sm:py-8">
                  {description ? (
                    <p className="mb-6 text-sm text-slate-500">{description}</p>
                  ) : null}
                  <div className="space-y-10">{children}</div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * A titled group of fields, divided from the next by its heading rule — the
 * way an Odoo sheet groups "Contacts & Addresses" from "Sales & Purchase".
 * Fields inside fall into two column groups on a wide screen.
 */
export const FormSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section>
    <div className="mb-5 border-b border-slate-200 pb-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{children}</div>
  </section>
);

/**
 * One labelled control, label above the control. `wide` spans both columns.
 */
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
  <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-slate-700"
    >
      {label}
    </label>
    {children}
    {hint ? (
      <p className="mt-1.5 text-xs leading-snug text-slate-500">{hint}</p>
    ) : null}
  </div>
);
