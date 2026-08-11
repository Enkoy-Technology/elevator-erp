import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Decimal } from 'decimal.js';

/** ETB money string: non-negative, up to 2 decimal places — the exact shape every money DTO field in this codebase uses. */
export const MONEY_RE = /^\d+(\.\d{1,2})?$/;

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
