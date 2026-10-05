import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import Decimal from 'decimal.js';

import type { TenantTransaction } from '../database/database.types';
import { contracts, type ProjectStatus } from '../database/schema';
import {
  addWorkingDaysIso,
  daysBetweenIso,
  todayIso,
  workingDaysBetweenIso,
} from './business-time';
import { DEFAULT_DELAY_PENALTY_PERCENT_PER_DAY } from './contract-defaults';

/**
 * The delivery the customer was promised, as every project list shows it.
 * All three are null until a contract with a delivery period is signed,
 * and again once it is handed over (the contract is then COMPLETED) or the
 * project leaves CONTRACT/EXECUTION.
 */
export type DeliveryCountdown = {
  /** Signing date + the contract's delivery working days, ISO 'YYYY-MM-DD'. */
  deliveryDueDate: string | null;
  /** Working days (Mon–Fri) from today to that date; negative once it has passed. */
  deliveryDaysLeft: number | null;
  /** The delay penalty run up so far, ETB; null unless the delivery is overdue. */
  deliveryPenaltyEtb: string | null;
};

const NONE: DeliveryCountdown = {
  deliveryDueDate: null,
  deliveryDaysLeft: null,
  deliveryPenaltyEtb: null,
};

/** The stages a delivery is still owed in; a cancelled or completed project has no countdown. */
const DELIVERY_PENDING: readonly ProjectStatus[] = ['CONTRACT', 'EXECUTION'];

/** What the countdown reads off one signed contract. */
export interface SignedDelivery {
  signedAt: string;
  deliveryDays: number;
  contractValueEtb: string;
  /** Null: the contract states none, so the company default applies. */
  penaltyPercentPerDay: string | null;
  penaltyCapPercent: string | null;
}

/**
 * The countdown: the contract's delivery period — working days, as its
 * Article 3.2 states it — counted from the day it was signed. With more
 * than one signed contract on a project, the earliest promise is the one
 * that binds.
 *
 * Once that date has passed, Article 7.1 runs: the penalty percent of the
 * contract price for EACH day of delay — every calendar day, weekends
 * included — up to the contract's cap when it states one.
 */
export const deliveryCountdown = (
  signed: readonly SignedDelivery[],
  today: string,
): DeliveryCountdown => {
  const first = signed
    .map((contract) => ({
      contract,
      due: addWorkingDaysIso(contract.signedAt, contract.deliveryDays),
    }))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  if (!first) {
    return NONE;
  }
  const { contract, due } = first;
  const daysLate = daysBetweenIso(due, today);
  const value = new Decimal(contract.contractValueEtb);
  const uncapped = value
    .mul(contract.penaltyPercentPerDay ?? DEFAULT_DELAY_PENALTY_PERCENT_PER_DAY)
    .div(100)
    .mul(daysLate);
  const penalty =
    contract.penaltyCapPercent === null
      ? uncapped
      : Decimal.min(uncapped, value.mul(contract.penaltyCapPercent).div(100));
  return {
    deliveryDueDate: due,
    deliveryDaysLeft: workingDaysBetweenIso(today, due),
    deliveryPenaltyEtb:
      daysLate > 0
        ? penalty.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
        : null,
  };
};

/**
 * The countdown of one contract on its own: only a SIGNED one with a
 * signing date and a delivery period has one. (A COMPLETED contract has
 * been handed over; a DRAFT has not started the clock.)
 */
export const contractDeliveryCountdown = (
  contract: {
    status: string;
    signedAt: string | null;
    deliveryWorkingDays: number | null;
    contractValueEtb: string;
    delayPenaltyPercentPerDay: string | null;
    delayPenaltyCapPercent: string | null;
  },
  today: string = todayIso(),
): DeliveryCountdown =>
  contract.status === 'SIGNED' &&
  contract.signedAt !== null &&
  contract.deliveryWorkingDays !== null
    ? deliveryCountdown(
        [
          {
            signedAt: contract.signedAt,
            deliveryDays: contract.deliveryWorkingDays,
            contractValueEtb: contract.contractValueEtb,
            penaltyPercentPerDay: contract.delayPenaltyPercentPerDay,
            penaltyCapPercent: contract.delayPenaltyCapPercent,
          },
        ],
        today,
      )
    : NONE;

/**
 * Attach the countdown to a page of project rows, inside the caller's
 * tenant transaction. One query for the page's signed contracts, not a
 * join: a project may carry several contracts and must still be one row.
 * ponytail: contracts has no (tenant_id, project_id) index, so this scans
 * the tenant's contracts; add the index when a tenant holds thousands.
 */
export const withDeliveryCountdown = async <
  TRow extends { id: string; status: ProjectStatus },
>(
  tx: TenantTransaction,
  rows: TRow[],
): Promise<(TRow & DeliveryCountdown)[]> => {
  const pendingIds = rows
    .filter((row) => DELIVERY_PENDING.includes(row.status))
    .map((row) => row.id);
  const signed =
    pendingIds.length === 0
      ? []
      : await tx
          .select({
            projectId: contracts.projectId,
            signedAt: contracts.signedAt,
            deliveryDays: contracts.deliveryWorkingDays,
            contractValueEtb: contracts.contractValueEtb,
            penaltyPercentPerDay: contracts.delayPenaltyPercentPerDay,
            penaltyCapPercent: contracts.delayPenaltyCapPercent,
          })
          .from(contracts)
          .where(
            and(
              inArray(contracts.projectId, pendingIds),
              eq(contracts.status, 'SIGNED'),
              isNotNull(contracts.signedAt),
              isNotNull(contracts.deliveryWorkingDays),
            ),
          );
  const today = todayIso();
  return rows.map((row) => ({
    ...row,
    ...deliveryCountdown(
      signed.flatMap((c) =>
        c.projectId === row.id && c.signedAt && c.deliveryDays !== null
          ? [{ ...c, signedAt: c.signedAt, deliveryDays: c.deliveryDays }]
          : [],
      ),
      today,
    ),
  }));
};
