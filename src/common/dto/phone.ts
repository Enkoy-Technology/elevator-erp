import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { normalizeEthiopianPhone } from '../phone';

/**
 * Validates a `phone` field is a shape `normalizeEthiopianPhone` will
 * accept — reusing that function (which strips spaces/dashes anywhere,
 * then checks the 0/251/+251 prefix and 9-digit national number) rather
 * than re-deriving the same rule as a second regex, so the two can never
 * drift apart (phase-5 review I4). Root-causes the "a bad phone number
 * silently kills every reminder for that recipient" bug: this runs where
 * the number is WRITTEN (customer/employee create+update), so the
 * `InvalidPhoneNumberError` thrown by that same normaliser at enqueue time
 * becomes unreachable in practice for anything created after this ships.
 *
 * Empty string passes through — the web forms send `phone: undefined` for
 * "left blank" (see `phone || undefined` in the customers/employees pages),
 * but an API caller sending `phone: ''` explicitly should not be rejected
 * for "clearing" an optional field, only for supplying a malformed value.
 */
@ValidatorConstraint({ name: 'isEthiopianPhone', async: false })
export class IsEthiopianPhoneConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string' || value.trim() === '') {
      return true;
    }
    try {
      normalizeEthiopianPhone(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'must be a recognisable Ethiopian phone number (e.g. 0911234567 or +251911234567)';
  }
}
