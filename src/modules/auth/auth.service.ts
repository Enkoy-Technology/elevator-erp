import { createHash } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';

import type { Env } from '../../config';
import type {
  AuthenticatedUser,
  JwtPayload,
  UserRole,
} from '../../types/auth.types';
import type { LoginDto } from './dto/login.dto';
import { TenantsRepository } from './repositories/tenants.repository';
import { UsersRepository, type UserRecord } from './repositories/users.repository';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthProfile {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
  lastLoginAt: Date | null;
}

const BLOCKED_SUBSCRIPTION_STATUSES = new Set(['SUSPENDED', 'CANCELLED']);

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const tenant = await this.tenantsRepository.resolveActiveBySlug(
      dto.tenantSlug,
    );
    // Same error for unknown tenant, unknown user, and bad password —
    // prevents tenant slug / account enumeration.
    if (!tenant || BLOCKED_SUBSCRIPTION_STATUSES.has(tenant.subscriptionStatus)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersRepository.findActiveByEmail(
      tenant.id,
      dto.email.toLowerCase(),
    );
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    await this.usersRepository.recordLogin(user.tenantId, user.id);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersRepository.findActiveById(
      payload.tenantId,
      payload.sub,
    );
    if (
      !user ||
      !user.refreshTokenHash ||
      user.refreshTokenHash !== this.hashToken(refreshToken)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.usersRepository.setRefreshTokenHash(
      user.tenantId,
      user.userId,
      null,
    );
  }

  async getProfile(user: AuthenticatedUser): Promise<AuthProfile> {
    const record = await this.usersRepository.findActiveById(
      user.tenantId,
      user.userId,
    );
    if (!record) {
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      userId: record.id,
      tenantId: record.tenantId,
      email: record.email,
      fullName: record.fullName,
      role: record.role,
      lastLoginAt: record.lastLoginAt,
    };
  }

  private async issueTokens(user: UserRecord): Promise<TokenPair> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL_SECONDS', {
      infer: true,
    });

    const base = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...base, type: 'access' } satisfies JwtPayload,
        { expiresIn: accessTtl },
      ),
      this.jwtService.signAsync(
        { ...base, type: 'refresh' } satisfies JwtPayload,
        { expiresIn: refreshTtl },
      ),
    ]);

    await this.usersRepository.setRefreshTokenHash(
      user.tenantId,
      user.id,
      this.hashToken(refreshToken),
    );

    return { accessToken, refreshToken, expiresInSeconds: accessTtl };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
