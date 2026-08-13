import { BadRequestException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import {
  IdempotencyKeyConflictError,
  IdempotencyKeyInProgressError,
} from '../exceptions';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IdempotencyKeysRepository } from './idempotency-keys.repository';

const TENANT_A = '22222222-2222-2222-2222-222222222222';
const TENANT_B = '99999999-9999-9999-9999-999999999999';

/**
 * A real (in-process, not mocked) implementation of the same claim/complete
 * protocol IdempotencyKeysRepository backs with Postgres — used here so the
 * four scenarios the task brief calls out (replay / conflict / different
 * keys / different tenant) exercise the ACTUAL state machine the
 * interceptor drives, not a canned mock response per test. The real
 * repository's own SQL wiring (unique constraint, stale reclaim) is proven
 * separately against real Postgres by the e2e double-submit test — this
 * fake exists purely to keep that same protocol's HTTP-facing behaviour
 * fast and dependency-free to test.
 */
class FakeIdempotencyKeysRepository {
  private readonly rows = new Map<
    string,
    { fingerprint: string; status: number | null; body: unknown }
  >();

  private rowKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async claim(tenantId: string, key: string, _endpoint: string, fingerprint: string) {
    const rowKey = this.rowKey(tenantId, key);
    const existing = this.rows.get(rowKey);
    if (!existing) {
      this.rows.set(rowKey, { fingerprint, status: null, body: null });
      return { kind: 'won' as const };
    }
    if (existing.fingerprint !== fingerprint) {
      throw new IdempotencyKeyConflictError(key);
    }
    if (existing.status !== null) {
      return { kind: 'replay' as const, status: existing.status, body: existing.body };
    }
    throw new IdempotencyKeyInProgressError(key);
  }

  async complete(tenantId: string, key: string, status: number, body: unknown): Promise<void> {
    const rowKey = this.rowKey(tenantId, key);
    const row = this.rows.get(rowKey);
    if (row) {
      row.status = status;
      row.body = body;
    }
  }
}

const makeContext = (
  headers: Record<string, string | undefined>,
  body: unknown,
  user: { tenantId: string; userId: string; role: string } | undefined,
  handlerName = 'record',
  className = 'PaymentsController',
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers, body, user }),
    }),
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: className }),
  }) as unknown as ExecutionContext;

const makeHandler = (returnValue: unknown, callCount: { count: number }): CallHandler => ({
  handle: () => {
    callCount.count += 1;
    return of(returnValue);
  },
});

describe('IdempotencyInterceptor', () => {
  const user = { tenantId: TENANT_A, userId: 'u1', role: 'FINANCE' };
  let repository: FakeIdempotencyKeysRepository;
  let reflector: Reflector;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    repository = new FakeIdempotencyKeysRepository();
    reflector = { get: jest.fn().mockReturnValue(201) } as unknown as Reflector;
    interceptor = new IdempotencyInterceptor(
      repository as unknown as IdempotencyKeysRepository,
      reflector,
    );
  });

  it('passes through untouched when no Idempotency-Key header is sent', async () => {
    const calls = { count: 0 };
    const ctx = makeContext({}, { amountEtb: '10.00' }, user);
    const result$ = await interceptor.intercept(ctx, makeHandler({ id: 'p1' }, calls));
    await expect(new Promise((resolve) => result$.subscribe(resolve))).resolves.toEqual({
      id: 'p1',
    });
    expect(calls.count).toBe(1);
  });

  it('rejects a blank Idempotency-Key header', async () => {
    const ctx = makeContext({ 'idempotency-key': '   ' }, {}, user);
    await expect(interceptor.intercept(ctx, makeHandler({}, { count: 0 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('same key + same body replays the first response without calling the handler again', async () => {
    const calls = { count: 0 };
    const body = { amountEtb: '112.00', method: 'CASH' };
    const ctx1 = makeContext({ 'idempotency-key': 'key-1' }, body, user);
    const first$ = await interceptor.intercept(ctx1, makeHandler({ id: 'receipt-1' }, calls));
    await new Promise((resolve) => first$.subscribe(resolve));
    expect(calls.count).toBe(1);

    const ctx2 = makeContext({ 'idempotency-key': 'key-1' }, body, user);
    const second$ = await interceptor.intercept(ctx2, makeHandler({ id: 'receipt-2' }, calls));
    const replayed = await new Promise((resolve) => second$.subscribe(resolve));

    // The handler was never invoked a second time (still 1) — the replayed
    // body is the FIRST call's stored response, not a fresh id.
    expect(calls.count).toBe(1);
    expect(replayed).toEqual({ id: 'receipt-1' });
  });

  it('same key + different body 409s and never touches the handler on the second call', async () => {
    const calls = { count: 0 };
    const ctx1 = makeContext(
      { 'idempotency-key': 'key-2' },
      { amountEtb: '112.00' },
      user,
    );
    const first$ = await interceptor.intercept(ctx1, makeHandler({ id: 'r1' }, calls));
    await new Promise((resolve) => first$.subscribe(resolve));
    expect(calls.count).toBe(1);

    const ctx2 = makeContext(
      { 'idempotency-key': 'key-2' },
      { amountEtb: '999.00' },
      user,
    );
    await expect(
      interceptor.intercept(ctx2, makeHandler({ id: 'r2' }, calls)),
    ).rejects.toThrow(IdempotencyKeyConflictError);
    // Still 1 — the mismatched second attempt never ran the handler.
    expect(calls.count).toBe(1);
  });

  it('different keys both execute the handler', async () => {
    const calls = { count: 0 };
    const ctx1 = makeContext({ 'idempotency-key': 'key-a' }, { amountEtb: '10' }, user);
    const first$ = await interceptor.intercept(ctx1, makeHandler({ id: 'a' }, calls));
    await new Promise((resolve) => first$.subscribe(resolve));

    const ctx2 = makeContext({ 'idempotency-key': 'key-b' }, { amountEtb: '10' }, user);
    const second$ = await interceptor.intercept(ctx2, makeHandler({ id: 'b' }, calls));
    await new Promise((resolve) => second$.subscribe(resolve));

    expect(calls.count).toBe(2);
  });

  it('the same key from a different tenant does not collide', async () => {
    const calls = { count: 0 };
    const userB = { tenantId: TENANT_B, userId: 'u2', role: 'FINANCE' };

    const ctxA = makeContext({ 'idempotency-key': 'shared-key' }, { amountEtb: '10' }, user);
    const firstA$ = await interceptor.intercept(ctxA, makeHandler({ id: 'a' }, calls));
    await new Promise((resolve) => firstA$.subscribe(resolve));

    // Same key, different tenant, DIFFERENT body — if this collided with
    // tenant A's claim it would 409 as a conflict instead of executing.
    const ctxB = makeContext(
      { 'idempotency-key': 'shared-key' },
      { amountEtb: '999' },
      userB,
    );
    const firstB$ = await interceptor.intercept(ctxB, makeHandler({ id: 'b' }, calls));
    await new Promise((resolve) => firstB$.subscribe(resolve));

    expect(calls.count).toBe(2);
  });

  it('stores the @HttpCode-declared status alongside the response on completion', async () => {
    reflector = { get: jest.fn().mockReturnValue(200) } as unknown as Reflector;
    interceptor = new IdempotencyInterceptor(
      repository as unknown as IdempotencyKeysRepository,
      reflector,
    );
    const completeSpy = jest.spyOn(repository, 'complete');

    const ctx = makeContext({ 'idempotency-key': 'key-status' }, { reason: 'void' }, user);
    const result$ = await interceptor.intercept(ctx, makeHandler({ status: 'VOID' }, { count: 0 }));
    await new Promise((resolve) => result$.subscribe(resolve));

    expect(completeSpy).toHaveBeenCalledWith(TENANT_A, 'key-status', 200, { status: 'VOID' });
  });
});
