/** Shared control styles for admin list/drawer pages. */

export const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25';

export const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 ' +
  'text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The one action a page is for. Brand orange with black text — the pairing the
 * company profile itself uses, and the only legible one on this orange.
 */
export const btnPrimary = `${btnBase} bg-gold-500 text-navy-950 hover:bg-gold-400 active:bg-gold-600`;

/** Real actions that aren't the main one. Reads as a control, stays quiet. */
export const btnSecondary = `${btnBase} border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50`;

/** Navigation and low-stakes links sitting among buttons. */
export const btnGhost = `${btnBase} font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900`;

/** Destructive or high-consequence confirmations. */
export const btnDanger = `${btnBase} bg-red-600 text-white hover:bg-red-700`;
