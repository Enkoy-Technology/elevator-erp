import type { ProjectStatus } from '@/lib/api';

/** Stages where the rep learns a number worth recording. */
const AMOUNT_FIELD = {
  QUOTATION: 'quotedAmountEtb',
  CONTRACT: 'contractAmountEtb',
} as const;

const ETB_AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export const CANCELLED = Symbol('cancelled');
export const INVALID = Symbol('invalid');

export type DealValue =
  { quotedAmountEtb?: string; contractAmountEtb?: string } | undefined;

/**
 * Quotations were dropped, so the deal value is captured here instead —
 * from the pipeline and from the customer page alike.
 * ponytail: window.prompt is the whole UI — swap for a drawer field if reps
 * find it clumsy.
 */
export const promptForDealValue = (
  project: {
    name: string;
    quotedAmountEtb?: string | null;
    contractAmountEtb?: string | null;
  },
  next: ProjectStatus,
): DealValue | typeof CANCELLED | typeof INVALID => {
  const field = AMOUNT_FIELD[next as keyof typeof AMOUNT_FIELD];
  if (!field) {
    return undefined;
  }
  const entered = window.prompt(
    next === 'QUOTATION'
      ? `Price offered to the customer for "${project.name}" (ETB). Leave blank to skip.`
      : `Signed contract value for "${project.name}" (ETB). Leave blank to skip.`,
    (next === 'QUOTATION'
      ? project.quotedAmountEtb
      : project.contractAmountEtb) ??
      project.quotedAmountEtb ??
      '',
  );
  if (entered === null) {
    return CANCELLED;
  }
  const trimmed = entered.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!ETB_AMOUNT.test(trimmed)) {
    return INVALID;
  }
  return { [field]: trimmed };
};
