import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { BankAccountsController } from './bank-accounts.controller';

describe('BankAccountsController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is FINANCE (ADMIN always passes RolesGuard.SUPER_ROLES), no method-level override', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, BankAccountsController);
    expect(classRoles).toEqual(['FINANCE']);

    for (const handler of [
      BankAccountsController.prototype.create,
      BankAccountsController.prototype.list,
      BankAccountsController.prototype.update,
      BankAccountsController.prototype.recordTransaction,
      BankAccountsController.prototype.reverseTransaction,
      BankAccountsController.prototype.listTransactions,
      BankAccountsController.prototype.unreconciled,
    ]) {
      expect(reflector.get<string[] | undefined>(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

/**
 * Brief 4.5: bank_transactions is insert-only — "no edit or delete endpoint
 * at all". Proven directly at the routing layer (not just "we didn't write
 * an update() method") by enumerating every route NestJS actually
 * registered on this controller and asserting none of them is a
 * PUT/PATCH/DELETE targeting a transactions path. PATCH :id (the bank
 * ACCOUNT update route) is expected and excluded on purpose — it is
 * mutable master data, only bank_transactions is insert-only.
 */
describe('BankAccountsController — bank_transactions has no update/delete route (brief 4.5)', () => {
  it('no handler method is PUT/PATCH/DELETE on a transactions path', () => {
    const handlerNames = Object.getOwnPropertyNames(BankAccountsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlerNames.length).toBeGreaterThan(0);

    const mutatingTransactionRoutes = handlerNames
      .map((name) => {
        const handler = (BankAccountsController.prototype as unknown as Record<string, unknown>)[
          name
        ] as (...args: unknown[]) => unknown;
        return {
          name,
          method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined,
          path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
        };
      })
      .filter(
        (route) =>
          typeof route.path === 'string' &&
          route.path.includes('transactions') &&
          (route.method === RequestMethod.PUT ||
            route.method === RequestMethod.PATCH ||
            route.method === RequestMethod.DELETE),
      );

    expect(mutatingTransactionRoutes).toEqual([]);
  });
});
