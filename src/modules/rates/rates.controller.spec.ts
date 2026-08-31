import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { RatesController } from './rates.controller';
import type { RatesService } from './rates.service';

// RolesGuard itself is fully covered (roles.guard.spec.ts) — what is NOT
// covered anywhere is which handlers actually carry @Roles('ADMIN'). A
// dropped decorator on POST /rates would hand every authenticated role
// write access to statutory tax rates with the guard suite still green.
describe('RatesController — role gating', () => {
  const reflector = new Reflector();

  it('gates POST /rates (rate creation) to ADMIN', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      RatesController.prototype.create,
    );
    expect(roles).toEqual(['ADMIN']);
  });

  it('leaves GET /rates open to any authenticated role', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      RatesController.prototype.get,
    );
    expect(roles).toBeUndefined();
  });
});

describe('RatesController.get — kind validation', () => {
  const service = { resolve: jest.fn() };
  const controller = new RatesController(service as unknown as RatesService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a missing kind with a 400', () => {
    expect(() => controller.get(undefined, '2026-08-08')).toThrow(
      BadRequestException,
    );
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it('rejects a kind outside rateKinds with a 400', () => {
    expect(() => controller.get('NOT_A_KIND', '2026-08-08')).toThrow(
      BadRequestException,
    );
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it('resolves a valid kind and passes the given date through', () => {
    service.resolve.mockReturnValue('ok');
    const result = controller.get('VAT', '2026-08-08');
    expect(result).toBe('ok');
    expect(service.resolve).toHaveBeenCalledWith('VAT', '2026-08-08');
  });

  it('defaults `on` to today in business time when omitted', () => {
    service.resolve.mockReturnValue('ok');
    void controller.get('VAT', undefined);
    expect(service.resolve).toHaveBeenCalledWith(
      'VAT',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  // Regression: an unvalidated `on` reached the `date` column comparison
  // directly and Postgres threw "invalid input syntax for type date" — an
  // unhandled 500 for what should be a routine bad-request typo.
  it('rejects a calendar-invalid `on` (shape-valid, not a real date) with a 400', () => {
    expect(() => controller.get('VAT', '2026-02-30')).toThrow(
      BadRequestException,
    );
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it('rejects an `on` that is not date-only shape with a 400', () => {
    expect(() => controller.get('VAT', '2026-08-08T00:00:00Z')).toThrow(
      BadRequestException,
    );
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it('rejects a nonsense `on` with a 400', () => {
    expect(() => controller.get('VAT', 'not-a-date')).toThrow(
      BadRequestException,
    );
    expect(service.resolve).not.toHaveBeenCalled();
  });
});
