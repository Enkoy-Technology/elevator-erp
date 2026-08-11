import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Decimal } from 'decimal.js';

/**
 * ETB money string: non-negative, up to 2 decimal places, capped at 12
 * integer digits — the exact shape every money DTO field in this codebase
 * uses. The 12-digit cap matches this codebase's `numeric(14, 2)` money
 * columns (14 total digits = 12 integer + 2 fraction); without it, a value
 * like '999999999999999.99' passes this regex but overflows the column
 * ("numeric field overflow ... must round to an absolute value less than
 * 10^12") and surfaces as an unhandled 500 through AllExceptionsFilter
 * instead of a 400 here. Keep this bound in step with the column precision —
 * see QUANTITY_RE below for its numeric(12, 3) counterpart.
 */
export const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Quantity string: non-negative, up to 3 decimal places, capped at 9 integer
 * digits — matches this codebase's `numeric(12, 3)` quantity columns (12
 * total digits = 9 integer + 3 fraction). Same overflow story as MONEY_RE
 * above; kept next to it so the two bounds can't drift from their column
 * precisions independently.
 */
export const QUANTITY_RE = /^\d{1,9}(\.\d{1,3})?$/;

/**
 * Validates an already-MONEY_RE-shaped string is strictly greater than zero.
 * Kept separate from the format regex (MONEY_RE alone accepts "0.00") since
 * only some money fields need ">0" (payment amounts, allocation amounts,
 * withholding amounts) while others don't (e.g. a unit price of 0 for a
 * free line item is legitimate) — apply `@Validate(PositiveMoneyConstraint)`
 * only where the brief actually requires it, alongside `@Matches(MONEY_RE)`
 * for the format itself.
 */
@ValidatorConstraint({ name: 'isPositiveMoney', async: false })
export class PositiveMoneyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    return (
      typeof value === 'string' && MONEY_RE.test(value) && new Decimal(value).gt(0)
    );
  }

  defaultMessage(): string {
    return 'must be a positive money amount, up to 2 decimal places';
  }
}
