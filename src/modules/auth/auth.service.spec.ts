import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';

import type { Env } from '../../config';
import { AuthService } from './auth.service';
import type { TenantsRepository } from './repositories/tenants.repository';
import type {
  UserRecord,
  UsersRepository,
} from './repositories/users.repository';

const TENANT_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_ID = '9b2f6c1e-2d3a-4c5b-8e7f-0a1b2c3d4e5f';

describe('AuthService', () => {
  let tenantsRepository: jest.Mocked<TenantsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let service: AuthService;
  let user: UserRecord;

  const jwtService = new JwtService({ secret: 'unit-test-secret-key-123456' });
  const config = {
    get: jest.fn((key: string) =>
      key === 'JWT_ACCESS_TTL_SECONDS' ? 900 : 604800,
    ),
  } as unknown as ConfigService<Env, true>;

  beforeEach(async () => {
    user = {
      tenantId: TENANT_ID,
      id: USER_ID,
      email: 'ceo@demo.example.com',
      passwordHash: await hash('correct-horse-battery', 4),
      fullName: 'Demo CEO',
      phone: null,
      role: 'CEO',
      isActive: true,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      mfaEnabled: false,
      mfaTotpSecret: null,
      notificationPreferences: null,
      refreshTokenHash: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    tenantsRepository = {
      resolveActiveBySlug: jest.fn(),
      findActiveById: jest.fn(),
    } as unknown as jest.Mocked<TenantsRepository>;
    usersRepository = {
      findActiveByEmail: jest.fn(),
      findActiveById: jest.fn(),
      setRefreshTokenHash: jest.fn(),
      recordLogin: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    service = new AuthService(
      tenantsRepository,
      usersRepository,
      jwtService,
      config,
    );
  });

  const login = () =>
    service.login({
      tenantSlug: 'demo',
      email: 'ceo@demo.example.com',
      password: 'correct-horse-battery',
    });

  it('issues access and refresh tokens on valid credentials', async () => {
    tenantsRepository.resolveActiveBySlug.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'ACTIVE',
    });
    usersRepository.findActiveByEmail.mockResolvedValue(user);

    const tokens = await login();

    expect(tokens.expiresInSeconds).toBe(900);
    const access = jwtService.verify<{ type: string; tenantId: string }>(
      tokens.accessToken,
    );
    expect(access.type).toBe('access');
    expect(access.tenantId).toBe(TENANT_ID);
    const refresh = jwtService.verify<{ type: string }>(tokens.refreshToken);
    expect(refresh.type).toBe('refresh');
    expect(usersRepository.setRefreshTokenHash).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
    expect(usersRepository.recordLogin).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
    );
  });

  it('rejects unknown tenant slugs with a generic error', async () => {
    tenantsRepository.resolveActiveBySlug.mockResolvedValue(null);
    await expect(login()).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(usersRepository.findActiveByEmail).not.toHaveBeenCalled();
  });

  it('rejects suspended tenants', async () => {
    tenantsRepository.resolveActiveBySlug.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'SUSPENDED',
    });
    await expect(login()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong passwords with the same generic error', async () => {
    tenantsRepository.resolveActiveBySlug.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'ACTIVE',
    });
    usersRepository.findActiveByEmail.mockResolvedValue(user);

    await expect(
      service.login({
        tenantSlug: 'demo',
        email: 'ceo@demo.example.com',
        password: 'wrong-password-entirely',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
  });

  it('refuses an access token passed to refresh', async () => {
    const accessToken = jwtService.sign({
      sub: USER_ID,
      tenantId: TENANT_ID,
      role: 'CEO',
      type:'access',
    });
    await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotates the refresh token when the stored hash matches', async () => {
    tenantsRepository.resolveActiveBySlug.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'ACTIVE',
    });
    usersRepository.findActiveByEmail.mockResolvedValue(user);
    const { refreshToken } = await login();

    const storedHash = usersRepository.setRefreshTokenHash.mock.calls.at(
      -1,
    )?.[2] as string;
    tenantsRepository.findActiveById.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'ACTIVE',
    });
    usersRepository.findActiveById.mockResolvedValue({
      ...user,
      refreshTokenHash: storedHash,
    });

    const rotated = await service.refresh(refreshToken);
    expect(rotated.accessToken).toBeDefined();
    expect(usersRepository.findActiveById).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
    );
  });

  it('rejects a refresh token that does not match the stored hash', async () => {
    const refreshToken = jwtService.sign({
      sub: USER_ID,
      tenantId: TENANT_ID,
      role: 'CEO',
      type:'refresh',
    });
    tenantsRepository.findActiveById.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'ACTIVE',
    });
    usersRepository.findActiveById.mockResolvedValue({
      ...user,
      refreshTokenHash: 'a'.repeat(64),
    });
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects refresh once the tenant is suspended', async () => {
    const refreshToken = jwtService.sign({
      sub: USER_ID,
      tenantId: TENANT_ID,
      role: 'CEO',
      type:'refresh',
    });
    tenantsRepository.findActiveById.mockResolvedValue({
      id: TENANT_ID,
      subscriptionStatus: 'SUSPENDED',
    });
    usersRepository.findActiveById.mockResolvedValue(user);
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
