import type { AuthenticatedUser } from '../../types/auth.types';
import type { MessagingRepository } from './messaging.repository';
import { MessagingService, renderTemplate } from './messaging.service';
import type { OutboxService } from './outbox.service';

const user: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'OFFICE_MANAGER',
};

const consented = new Date('2026-01-01T00:00:00Z');

describe('renderTemplate', () => {
  it('fills {{name}} and {{company}} in any case and spacing, leaves the rest alone', () => {
    expect(
      renderTemplate('Dear {{ name }}, Melkam Addis Amet from {{COMPANY}}! {{other}}', {
        name: 'Abebe',
        company: 'Shining Star',
      }),
    ).toBe('Dear Abebe, Melkam Addis Amet from Shining Star! {{other}}');
  });
});

describe('MessagingService.broadcast', () => {
  const recipients = [
    { id: 'a', name: 'Abebe', phone: '0911000001', smsConsentAt: consented, smsConsentRevokedAt: null },
    { id: 'b', name: 'Bekele', phone: '0911000002', smsConsentAt: null, smsConsentRevokedAt: null },
    { id: 'c', name: 'Chaltu', phone: null, smsConsentAt: consented, smsConsentRevokedAt: null },
    { id: 'd', name: 'Dawit', phone: '0911000004', smsConsentAt: consented, smsConsentRevokedAt: new Date() },
  ];
  const repo = {
    listEmployeeRecipients: jest.fn(async () => recipients),
    listCustomerRecipients: jest.fn(async () => []),
    tenantName: jest.fn(async () => 'Shining Star'),
  };
  const enqueue = jest.fn(async () => ({}));
  const service = new MessagingService(
    repo as unknown as MessagingRepository,
    { enqueue } as unknown as OutboxService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('queues one rendered message per consenting recipient with a phone, and counts the rest', async () => {
    const result = await service.broadcast(user, {
      audience: 'EMPLOYEES',
      roles: ['MAINTENANCE_ENGINEER'],
      body: 'Hi {{name}}, from {{company}}.',
    });
    expect(repo.listEmployeeRecipients).toHaveBeenCalledWith(user.tenantId, ['MAINTENANCE_ENGINEER']);
    expect(result).toMatchObject({ audienceSize: 4, queued: 1, skippedNoConsent: 2, skippedNoPhone: 1, sendAt: null });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'SMS',
        recipient: '0911000001',
        body: 'Hi Abebe, from Shining Star.',
        subjectKind: 'BROADCAST',
        subjectId: result.broadcastId,
        dedupeKey: `broadcast:${result.broadcastId}:a`,
        consentAt: consented,
      }),
    );
  });

  it('preview reports the same counts without queuing anything', async () => {
    const result = await service.preview(user, { audience: 'EMPLOYEES', body: 'x' });
    expect(result).toMatchObject({ audienceSize: 4, queued: 1 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('passes a future sendAt through as the hold time and rejects one in the past', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await service.broadcast(user, { audience: 'EMPLOYEES', body: 'x', sendAt: future });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ sendAt: new Date(future) }));
    await expect(
      service.broadcast(user, { audience: 'EMPLOYEES', body: 'x', sendAt: '2020-01-01T00:00:00Z' }),
    ).rejects.toThrow(/in the past/);
  });
});
