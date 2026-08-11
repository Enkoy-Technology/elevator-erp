import { NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { InvoiceRecord, InvoiceWithLines } from './invoices.repository';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const invoiceWithLines: InvoiceWithLines = {
    tenantId: user.tenantId,
    id: '88888888-8888-8888-8888-888888888888',
    invoiceNumber: 'INV-FY2026-27-0001',
    fiscalYearLabel: 'FY2026/27',
    proformaId: null,
    customerId: '66666666-6666-6666-6666-666666666666',
    projectId: null,
    subtotalEtb: '100.00',
    vatEtb: '15.00',
    whtEtb: '0.00',
    whtVoucherRef: null,
    whtRecordedAt: null,
    totalEtb: '115.00',
    rateVersionId: '77777777-7777-7777-7777-777777777777',
    status: 'ISSUED',
    voidReason: null,
    issuedAt: new Date('2026-08-08T00:00:00.000Z'),
    issuedByUserId: user.userId,
    dueDate: null,
    fiscalReceiptNumber: null,
    fiscalDeviceSerial: null,
    fiscalIssuedAt: null,
    fiscalKind: null,
    fiscalNote: null,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    lines: [],
  };

  const repo = {
    list: jest.fn(),
    streamAll: jest.fn(),
    findByIdWithLines: jest.fn(),
    issueFromProforma: jest.fn(),
    createStandalone: jest.fn(),
    voidInvoice: jest.fn(),
    patchFiscal: jest.fn(),
  };
  const ratesService = { resolve: jest.fn() };

  const service = new InvoicesService(repo as never, ratesService as never);

  beforeEach(() => jest.clearAllMocks());

  it('issueFromProforma() delegates with dueDate coerced to null when omitted', async () => {
    repo.issueFromProforma.mockResolvedValue(invoiceWithLines);
    await service.issueFromProforma(user, 'proforma-1', undefined);
    expect(repo.issueFromProforma).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      'proforma-1',
      null,
    );
  });

  it('issueFromProforma() passes dueDate through when given', async () => {
    repo.issueFromProforma.mockResolvedValue(invoiceWithLines);
    await service.issueFromProforma(user, 'proforma-1', '2026-09-30');
    expect(repo.issueFromProforma).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      'proforma-1',
      '2026-09-30',
    );
  });

  it('getById() 404s on a missing invoice', async () => {
    repo.findByIdWithLines.mockResolvedValue(null);
    await expect(service.getById(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById() returns the row when found', async () => {
    repo.findByIdWithLines.mockResolvedValue(invoiceWithLines);
    await expect(service.getById(user, 'x')).resolves.toEqual(invoiceWithLines);
  });

  it('voidInvoice()/patchFiscal() delegate straight to the repository', async () => {
    const voided: InvoiceRecord = { ...invoiceWithLines, status: 'VOID', voidReason: 'oops' };
    repo.voidInvoice.mockResolvedValue(voided);
    await expect(service.voidInvoice(user, 'x', 'oops')).resolves.toEqual(voided);
    expect(repo.voidInvoice).toHaveBeenCalledWith(user.tenantId, 'x', 'oops');

    repo.patchFiscal.mockResolvedValue(invoiceWithLines);
    await service.patchFiscal(user, 'x', { fiscalNote: 'note' });
    expect(repo.patchFiscal).toHaveBeenCalledWith(user.tenantId, 'x', { fiscalNote: 'note' });
  });

  describe('createStandalone() — server-side VAT resolution + decimal line math', () => {
    const dto: CreateInvoiceDto = {
      customerId: invoiceWithLines.customerId,
      lines: [{ description: 'Maintenance visit', quantity: '3.333', unitPriceEtb: '10.00' }],
    };

    beforeEach(() => {
      ratesService.resolve.mockResolvedValue({
        id: invoiceWithLines.rateVersionId,
        kind: 'VAT',
        validFrom: '2020-01-01',
        validTo: null,
        payload: { percent: '15' },
      });
      repo.createStandalone.mockResolvedValue(invoiceWithLines);
    });

    it('computes lineTotal HALF_UP at 2dp — pinned reviewer counterexample: 3.333 x 10.00 = 33.33', async () => {
      await service.createStandalone(user, dto);
      expect(ratesService.resolve).toHaveBeenCalledWith('VAT', expect.any(String));
      const call = repo.createStandalone.mock.calls[0];
      expect(call[0]).toBe(user.tenantId);
      expect(call[1]).toBe(user.userId);
      const input = call[2];
      expect(input.lines[0]).toMatchObject({
        lineNo: 1,
        description: 'Maintenance visit',
        lineTotalEtb: '33.33',
      });
      expect(input.subtotalEtb).toBe('33.33');
      // 33.33 * 15% = 4.9995 -> HALF_UP -> 5.00
      expect(input.vatEtb).toBe('5.00');
      expect(input.totalEtb).toBe('38.33');
      expect(input.rateVersionId).toBe(invoiceWithLines.rateVersionId);
    });

    it('sums multiple lines into a single subtotal/vat/total', async () => {
      const multiLineDto: CreateInvoiceDto = {
        customerId: invoiceWithLines.customerId,
        lines: [
          { description: 'Line A', quantity: '2', unitPriceEtb: '50.00' },
          { description: 'Line B', quantity: '1', unitPriceEtb: '25.00' },
        ],
      };
      await service.createStandalone(user, multiLineDto);
      const input = repo.createStandalone.mock.calls[0][2];
      expect(input.lines).toHaveLength(2);
      expect(input.lines[1].lineNo).toBe(2);
      expect(input.subtotalEtb).toBe('125.00');
      expect(input.totalEtb).toBe('143.75');
    });

    it('passes projectId/dueDate through only when the DTO provides them', async () => {
      await service.createStandalone(user, dto);
      let input = repo.createStandalone.mock.calls[0][2];
      expect(input.projectId).toBeNull();
      expect(input.dueDate).toBeNull();

      await service.createStandalone(user, { ...dto, projectId: 'proj-1', dueDate: '2026-09-30' });
      input = repo.createStandalone.mock.calls[1][2];
      expect(input.projectId).toBe('proj-1');
      expect(input.dueDate).toBe('2026-09-30');
    });
  });
});
