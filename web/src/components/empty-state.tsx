import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** What is not here, and the next action — name the screen it lives on. */
  message: string;
  /** Optional control that performs that next action. */
  action?: ReactNode;
}

/** A zero-state is an instruction, not a mood: no illustration, no apology. */
export const EmptyState = ({ message, action }: EmptyStateProps) => (
  <div className="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
    <p className="mx-auto max-w-md text-sm text-slate-600">{message}</p>
    {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
  </div>
);
