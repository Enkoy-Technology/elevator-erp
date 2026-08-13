import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { lastValueFrom, type Observable, of } from 'rxjs';

import type { AuthenticatedUser } from '../../types/auth.types';
import { IdempotencyKeysRepository } from './idempotency-keys.repository';
import { fingerprintRequest } from './request-fingerprint';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** `@ApiHeader(IDEMPOTENCY_KEY_API_HEADER)` on every route this interceptor guards — one shared description instead of four copies. */
export const IDEMPOTENCY_KEY_API_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Optional client-generated key, unique per tenant. A repeat with the same key and the same request body returns the first response instead of re-executing; the same key with a different body 409s.',
};
// Every route this is applied to declares its own @HttpCode explicitly
// (checked in idempotency-routes.spec.ts) — this is a defensive fallback
// only, matching Nest's own default for POST.
const DEFAULT_STATUS = 201;

/**
 * Guards a mutating finance endpoint against a double-submit. Why: the
 * client's site loses power ~39 times a month (task brief), and a finance
 * officer whose "Record payment" click appears to hang will click it again
 * — these endpoints are append-only by DB grant, so a duplicate receipt/
 * expense/transaction can't be edited away afterwards, only reversed (a
 * real, avoidable mess, not a cosmetic one).
 *
 * Applied per-method via `@UseInterceptors(IdempotencyInterceptor)` on the
 * specific controllers that need it — see each one for which routes and
 * why. No `Idempotency-Key` header on the request -> passthrough,
 * unprotected: this interceptor cannot protect a client that doesn't send
 * one, and every covered route already worked without it.
 *
 * The state machine itself lives in `IdempotencyKeysRepository.claim` (see
 * its own doc comment for the full replay/conflict/in-progress protocol) —
 * this class is the HTTP-shaped wrapper around it: read the header, compute
 * the fingerprint, claim, either replay or run the real handler and store
 * its response.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly repository: IdempotencyKeysRepository,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const rawHeader = request.headers[IDEMPOTENCY_KEY_HEADER];
    if (!rawHeader) {
      return next.handle();
    }
    const key = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header must not be empty');
    }

    const user = request.user;
    // JwtAuthGuard/TenantGuard (APP_GUARD, ahead of every interceptor) never
    // let an unauthenticated request reach here. Defensive only.
    if (!user) {
      return next.handle();
    }

    const endpoint = `${context.getClass().name}#${context.getHandler().name}`;
    const fingerprint = fingerprintRequest(endpoint, request.body);

    const claim = await this.repository.claim(user.tenantId, key, endpoint, fingerprint);
    if (claim.kind === 'replay') {
      return of(claim.body);
    }

    const status =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ?? DEFAULT_STATUS;
    const body: unknown = await lastValueFrom(next.handle());
    await this.repository.complete(user.tenantId, key, status, body);
    return of(body);
  }
}
