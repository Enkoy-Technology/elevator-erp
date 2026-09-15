'use client';

import {
  useEffect,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions, right-aligned: Cancel and the one thing the dialog asks about. */
  footer?: ReactNode;
}

/**
 * A centred confirmation for one question — approve this, delete that.
 * Same contract as SideDrawer, which stays for short forms that need the
 * room; a question is answered where the eye already is.
 */
export const Dialog = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: DialogProps) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const onBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      onClick={onBackdrop}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl shadow-slate-900/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="px-6 pt-5">
          <h2
            id="dialog-title"
            className="font-display text-lg font-semibold text-slate-900"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
};
