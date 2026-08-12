import type { AuthenticatedUser } from '../../types/auth.types';
import type { EmployeePublic } from './employees.repository';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'ADMIN',
  };

  const sample: EmployeePublic = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'sales@shiningstar.et',
    fullName: 'Abebe Kebede',
    phone: null,
    role: 'SALES_MANAGER',
    isActive: true,
    smsConsentAt: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const repo = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const service = new EmployeesService(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('update with a password sends a bcrypt hash, never the plaintext', async () => {
    repo.update.mockResolvedValue(sample);

    await service.update(user, sample.id, { password: 'NewTempPass!123' });

    expect(repo.update).toHaveBeenCalledTimes(1);
    const patch = repo.update.mock.calls[0]?.[2];
    expect(patch.passwordHash).toBeDefined();
    expect(patch.passwordHash).not.toBe('NewTempPass!123');
    expect(patch.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(patch.password).toBeUndefined();
  });

  it('update without a password sends no password hash', async () => {
    repo.update.mockResolvedValue(sample);

    await service.update(user, sample.id, { fullName: 'New Name' });

    expect(repo.update).toHaveBeenCalledWith(user.tenantId, sample.id, {
      fullName: 'New Name',
      phone: undefined,
      role: undefined,
      isActive: undefined,
    });
    const patch = repo.update.mock.calls[0]?.[2];
    expect(patch.passwordHash).toBeUndefined();
  });

  it('propagates LastAdminError from the repository unchanged', async () => {
    class LastAdminErrorStub extends Error {}
    repo.update.mockRejectedValue(new LastAdminErrorStub());

    await expect(
      service.update(user, sample.id, { isActive: false }),
    ).rejects.toBeInstanceOf(LastAdminErrorStub);
  });
});
