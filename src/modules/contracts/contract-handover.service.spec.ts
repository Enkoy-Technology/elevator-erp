import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ContractHandoverService } from './contract-handover.service';
import type { ContractCertificateRow } from './contract-handover.repository';

const user = { tenantId: 't1', userId: 'u1' } as AuthenticatedUser;

const row = (overrides: Partial<ContractCertificateRow> = {}): ContractCertificateRow => ({
  contractNumber: 'CNT-FY2026-27-0001',
  status: 'COMPLETED',
  projectName: 'Bole Twin Towers',
  customerName: 'Acme Real Estate PLC',
  scopeOfWork: 'Supply and installation of one 8-person passenger elevator.',
  warrantyMonths: 24,
  signedAt: '2025-03-01',
  handedOverAt: '2026-08-14',
  handedOverToName: 'Abebe Kebede',
  handoverNotes: null,
  technicalSpec: { productType: 'PASSENGER' },
  ...overrides,
});

const build = (found: ContractCertificateRow | null) => {
  const repository = {
    findByIdForCertificate: jest.fn(async () => found),
    handover: jest.fn(async () => ({ id: 'c1' })),
  };
  return {
    service: new ContractHandoverService(repository as never),
    repository,
  };
};

describe('ContractHandoverService.handover', () => {
  it('defaults handedOverAt to today and normalises absent notes to null', async () => {
    const { service, repository } = build(row());

    await service.handover(user, 'c1', { handedOverToName: 'Abebe Kebede' });

    expect(repository.handover).toHaveBeenCalledWith('t1', 'c1', {
      handedOverAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      handedOverToName: 'Abebe Kebede',
      handoverNotes: null,
    });
  });
});

describe('ContractHandoverService.completionCertificateData', () => {
  it('refuses to issue before a handover is recorded', async () => {
    const { service } = build(row({ handedOverAt: null, handedOverToName: null }));

    await expect(
      service.completionCertificateData(user, 'c1'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('404s on a contract that is not there', async () => {
    const { service } = build(null);

    await expect(service.completionCertificateData(user, 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('carries the scope, the handover date and who accepted it onto the document', async () => {
    const { service } = build(row());

    const { data } = await service.completionCertificateData(user, 'c1');

    expect(data.handedOverAt).toBe('2026-08-14');
    expect(data.handedOverToName).toBe('Abebe Kebede');
    expect(data.scopeOfWork).toContain('8-person passenger elevator');
  });
});

describe('ContractHandoverService.warrantyCertificateData', () => {
  it('refuses rather than printing a blank period when warrantyMonths is null', async () => {
    const { service } = build(row({ warrantyMonths: null }));

    await expect(service.warrantyCertificateData(user, 'c1')).rejects.toThrow(
      /carries no warranty period/,
    );
  });

  it('runs the period from the handover date when one exists', async () => {
    const { service } = build(row());

    const { data } = await service.warrantyCertificateData(user, 'c1');

    expect(data.warranty).toEqual({
      basis: 'HANDOVER',
      startsOn: '2026-08-14',
      expiresOn: '2028-08-14',
    });
  });

  it('falls back to the signed date, and says so, when no handover was recorded', async () => {
    const { service } = build(
      row({ handedOverAt: null, handedOverToName: null, warrantyMonths: 12 }),
    );

    const { data } = await service.warrantyCertificateData(user, 'c1');

    expect(data.warranty).toEqual({
      basis: 'SIGNING',
      startsOn: '2025-03-01',
      expiresOn: '2026-03-01',
    });
  });

  it('refuses when there is neither a handover nor a signing date', async () => {
    const { service } = build(row({ handedOverAt: null, signedAt: null }));

    await expect(service.warrantyCertificateData(user, 'c1')).rejects.toThrow(
      /cannot be computed/,
    );
  });
});
