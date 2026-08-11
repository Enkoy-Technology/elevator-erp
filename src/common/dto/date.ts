import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

const ONE_DAY_MS = 86_400_000;

/**
 * Rejects an ISO-8601 date/time more than one day in the future — catches a
 * year typo ("2027" for "2026") before it lands as a real payment/
 * withholding record. Pair with `@IsISO8601()`, same stacking as
 * `PositiveMoneyConstraint` alongside `@Matches(MONEY_RE)` in money.ts:
 * format is that decorator's job, "not absurdly far in the future" is
 * this one's.
 *
 * One day of slack, not zero — a client a few hours ahead on the clock, or
 * recording something at 23:50 for "today" in a timezone east of the
 * server, must not be rejected for a date that is legitimately today.
 * Non-string/unparsable values pass through untouched; format is
 * `@IsISO8601()`'s job, not this one's.
 */
@ValidatorConstraint({ name: 'isNotFarFuture', async: false })
export class NotFarFutureConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return true;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return true;
    }
    return date.getTime() <= Date.now() + ONE_DAY_MS;
  }

  defaultMessage(): string {
    return 'must not be more than one day in the future';
  }
}
