import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../../config';
import type { AuthenticatedUser, JwtPayload } from '../../../types/auth.types';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * The token is only a claim; the row is the truth. Without this lookup a
   * deactivated or demoted user keeps their old access for the rest of the
   * token TTL, because nothing else in the guard chain reads the users table.
   * The role comes from the row too, so a demotion applies on the next request.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Refresh tokens cannot access the API');
    }
    const user = await this.usersRepository.findActiveById(
      payload.tenantId,
      payload.sub,
    );
    if (!user) {
      throw new UnauthorizedException('Account is no longer active');
    }
    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };
  }
}
