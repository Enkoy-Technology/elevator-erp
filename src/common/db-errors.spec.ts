import { isForeignKeyViolation } from './db-errors';

describe('isForeignKeyViolation', () => {
  it('matches the real drizzle-orm/node-postgres shape: code lives on err.cause, not err itself', () => {
    const cause: Error & { code?: string } = new Error(
      'insert or update on table "payments" violates foreign key constraint "payments_customer_id_fkey"',
    );
    cause.code = '23503';
    const err: Error & { cause?: unknown } = new Error('Failed query: insert into "payments" ...');
    err.cause = cause;

    expect(isForeignKeyViolation(err)).toBe(true);
  });

  it('also matches a plain err.code (e.g. a hand-built test double)', () => {
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
  });

  it('does not match a unique-violation code', () => {
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });

  it('does not match an unrelated error', () => {
    expect(isForeignKeyViolation(new Error('connection reset'))).toBe(false);
  });
});
