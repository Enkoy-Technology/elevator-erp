'use client';

import { useCallback, useState, type ReactNode } from 'react';

import { Dialog } from './dialog';
import { btnDanger, btnPrimary, btnSecondary } from './form-styles';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** The one button that does the thing; defaults to "Confirm". */
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** Ask for one value — a reason, a date — and return it. */
  input?: {
    label: string;
    kind?: 'text' | 'date';
    placeholder?: string;
    hint?: string;
    /** Refuse an empty answer; a reason needs at least this many characters. */
    minLength?: number;
    initial?: string;
  };
}

/**
 * The app's answer to window.confirm / window.prompt: one dialog, awaited.
 * Resolves to the typed value ('' when there is no input) on confirm and
 * null on cancel. Render `confirmDialog` once anywhere in the page.
 */
export const useConfirm = (): {
  confirm: (options: ConfirmOptions) => Promise<string | null>;
  confirmDialog: ReactNode;
} => {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(options.input?.initial ?? '');
        setProblem(null);
        setPending({ options, resolve });
      }),
    [],
  );

  const close = (result: string | null) => {
    pending?.resolve(result);
    setPending(null);
  };

  const submit = () => {
    if (!pending) {
      return;
    }
    const { input } = pending.options;
    const trimmed = value.trim();
    if (input?.minLength && trimmed.length < input.minLength) {
      setProblem(
        `${input.label} must be at least ${input.minLength} characters.`,
      );
      return;
    }
    close(trimmed);
  };

  const options = pending?.options;
  const confirmDialog = options ? (
    <Dialog
      open
      title={options.title}
      description={options.description}
      onClose={() => close(null)}
      footer={
        <>
          <button
            type="button"
            onClick={() => close(null)}
            className={btnSecondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className={options.tone === 'danger' ? btnDanger : btnPrimary}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      {options.input ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="confirm-input"
            className="mb-1 block text-xs font-semibold text-slate-600"
          >
            {options.input.label}
          </label>
          {options.input.kind === 'date' ? (
            <input
              id="confirm-input"
              type="date"
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <textarea
              id="confirm-input"
              rows={3}
              autoFocus
              placeholder={options.input.placeholder}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          {problem ? (
            <p className="mt-1 text-xs text-red-700">{problem}</p>
          ) : options.input.hint ? (
            <p className="mt-1 text-xs text-slate-500">{options.input.hint}</p>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  ) : null;

  return { confirm, confirmDialog };
};
