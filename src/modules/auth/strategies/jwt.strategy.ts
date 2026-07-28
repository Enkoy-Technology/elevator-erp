import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../../config';
import type { AuthenticatedUser, JwtPayload } from '../../../types/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Refresh tokens cannot access the API');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
