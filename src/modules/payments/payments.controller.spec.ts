import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import type { DocumentPdfService } from '../../common/export/document-pdf.service';
import { setDownloadHeaders } from '../../common/export/tabular';
import type { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';

jest.mock('../../common/export/tabular');
const mockSetDownloadHeaders = jest.mocked(setDownloadHeaders);

describe('PaymentsController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is FINANCE, and the document endpoint does not need a method-level override', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, PaymentsController);
    expect(classRoles).toEqual(['FINANCE']);

    for (const handler of [
      PaymentsController.prototype.record,
      PaymentsController.prototype.allocate,
      PaymentsController.prototype.reverse,
      PaymentsController.prototype.document,
    ]) {
      expect(reflector.get<string[] | undefined>(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

describe('PaymentsController.document — format routing, filenames, and xlsx rejection', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const row = {
    receiptNumber: 'RCT-FY2026-27-0001',
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    customerName: 'Acme',
    amountEtb: '112.00',
    method: 'BANK_TRANSFER',
    reference: 'TXN-1',
    allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '112.00' }],
    originalReceiptNumber: null,
  };

  const paymentsService = { getDocumentData: jest.fn() };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };
  const res = { end: jest.fn() };

  const controller = new PaymentsController(
    paymentsService as unknown as PaymentsService,
    pdfService as unknown as DocumentPdfService,
    docxService,
    tenantBranding as unknown as TenantBrandingProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    paymentsService.getDocumentData.mockResolvedValue(row);
    tenantBranding.get.mockResolvedValue(branding);
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(controller.document(user, 'id', 'csv', res as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(paymentsService.getDocumentData).not.toHaveBeenCalled();
  });

  it('rejects xlsx with a 400 before touching the service — a receipt is not a table', async () => {
    await expect(controller.document(user, 'id', 'xlsx', res as never)).rejects.toThrow(
      /xlsx is not supported for payment receipts/,
    );
    expect(paymentsService.getDocumentData).not.toHaveBeenCalled();
  });

  it('format=pdf: renders via DocumentPdfService and writes receipt-<receiptNumber>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));

    await controller.document(user, 'id', 'pdf', res as never);

    expect(paymentsService.getDocumentData).toHaveBeenCalledWith(user, 'id');
    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'receipt',
      expect.objectContaining({ receiptNumber: 'RCT-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'receipt-RCT-FY2026-27-0001',
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('format=docx: renders via DocumentDocxService and writes the Word content type', async () => {
    docxService.renderDocumentDocx.mockResolvedValue(Buffer.from('PK'));

    await controller.document(user, 'id', 'docx', res as never);

    expect(docxService.renderDocumentDocx).toHaveBeenCalledWith(
      'receipt',
      expect.objectContaining({ receiptNumber: 'RCT-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'receipt-RCT-FY2026-27-0001',
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('PK'));
  });
});
