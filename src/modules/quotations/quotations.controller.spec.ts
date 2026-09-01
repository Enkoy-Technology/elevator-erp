import type { DocumentAppendixContent } from '../../common/export/templates/commercial-document';
import type { DocumentContentProvider } from '../../common/export/document-content.provider';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { setDownloadHeaders, singleRow, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { QuotationsController } from './quotations.controller';
import type { DocumentPdfService } from '../../common/export/document-pdf.service';
import type { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { QuotationsService } from './quotations.service';

jest.mock('../../common/export/tabular');
const mockWriteXlsx = jest.mocked(writeXlsx);
const mockSetDownloadHeaders = jest.mocked(setDownloadHeaders);
const mockSingleRow = jest.mocked(singleRow);

describe('QuotationsController — role gating', () => {
  const reflector = new Reflector();

  it('leaves the document download open to any of the class-level read roles (no method-level override)', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      QuotationsController.prototype.document,
    );
    expect(roles).toBeUndefined();
  });

  it('gates the technical proposal on the same class-level read roles', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      QuotationsController.prototype.technicalProposal,
    );
    expect(roles).toBeUndefined();
  });

  it('leaves GET /quotations/:id open the same way, for comparison', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      QuotationsController.prototype.get,
    );
    expect(roles).toBeUndefined();
  });
});

describe('QuotationsController.document — format routing and filenames', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const row = {
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'APPROVED',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    validUntil: null,
    customerName: 'Acme',
    projectName: 'Bole Tower',
    technicalSpec: null,
    pricingBreakdown: null,
    subtotalEtb: '100000.00',
    marginPercent: '25.00',
    marginAmountEtb: '25000.00',
    taxPercent: '15.00',
    taxAmountEtb: '18750.00',
    totalPriceEtb: '143750.00',
    notes: null,
  };

  const quotationsService = {
    getDocumentData: jest.fn().mockResolvedValue(row),
  };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  // Pages 3+ of the document. An empty appendix is the realistic default for
  // a tenant that has not filled its boilerplate in yet.
  const documentContent = {
    get: jest.fn<Promise<DocumentAppendixContent>, [string]>(async () => ({
      boilerplate: [],
      components: [],
    })),
  };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };

  const res = { end: jest.fn() };

  const controller = new QuotationsController(
    quotationsService as unknown as QuotationsService,
    pdfService as unknown as DocumentPdfService,
    docxService,
    tenantBranding as unknown as TenantBrandingProvider,
    documentContent as unknown as DocumentContentProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    quotationsService.getDocumentData.mockResolvedValue(row);
    tenantBranding.get.mockResolvedValue(branding);
    mockSingleRow.mockImplementation((async function* (r: Record<string, unknown>) {
      yield r;
    }) as typeof singleRow);
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.document(user, 'id', 'csv', res as never),
    ).rejects.toThrow(BadRequestException);
    expect(quotationsService.getDocumentData).not.toHaveBeenCalled();
  });

  it('rejects a missing format with a 400', async () => {
    await expect(
      controller.document(user, 'id', undefined, res as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('format=pdf: renders via DocumentPdfService and writes quotation-<quoteNumber>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));
    documentContent.get.mockResolvedValue({
      boilerplate: [{ title: 'Standards', body: 'EN 81-20 / EN 81-50' }],
      components: [
        { sequence: 1, componentName: 'Traction machine', brand: 'FUJI', remark: null },
      ],
    });

    await controller.document(user, 'id', 'pdf', res as never);

    expect(quotationsService.getDocumentData).toHaveBeenCalledWith(user, 'id');
    expect(tenantBranding.get).toHaveBeenCalledWith(user.tenantId);
    // Pages 3+ must actually reach the renderer. The provider was registered
    // in the module but injected nowhere, so the tenant's boilerplate and
    // component table were loaded by nothing and never printed — the whole
    // settings feature was inert at runtime while every test still passed.
    expect(documentContent.get).toHaveBeenCalledWith(user.tenantId);
    const [, data] = pdfService.renderDocumentPdf.mock.calls[0] ?? [];
    expect(data).toMatchObject({
      boilerplate: [{ title: 'Standards', body: 'EN 81-20 / EN 81-50' }],
    });
    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'quotation',
      expect.objectContaining({ quoteNumber: 'QTN-2026-ABCD1234' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'quotation-QTN-2026-ABCD1234',
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
    expect(docxService.renderDocumentDocx).not.toHaveBeenCalled();
  });

  it('format=docx: renders via DocumentDocxService and writes the Word content type', async () => {
    docxService.renderDocumentDocx.mockResolvedValue(Buffer.from('PK'));

    await controller.document(user, 'id', 'docx', res as never);

    expect(docxService.renderDocumentDocx).toHaveBeenCalledWith(
      'quotation',
      expect.objectContaining({ quoteNumber: 'QTN-2026-ABCD1234' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'quotation-QTN-2026-ABCD1234',
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('PK'));
    expect(pdfService.renderDocumentPdf).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx and never touches branding/pdf/docx', async () => {
    await controller.document(user, 'id', 'xlsx', res as never);

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      'quotation-QTN-2026-ABCD1234',
      expect.arrayContaining([expect.objectContaining({ key: 'quoteNumber' })]),
      expect.anything(),
    );
    expect(tenantBranding.get).not.toHaveBeenCalled();
    expect(pdfService.renderDocumentPdf).not.toHaveBeenCalled();
    expect(docxService.renderDocumentDocx).not.toHaveBeenCalled();
  });
});

describe('QuotationsController.technicalProposal', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'TECHNICAL_LEAD',
  };

  const row = {
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'APPROVED',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    validUntil: null,
    customerName: 'Acme',
    projectName: 'Bole Tower',
    technicalSpec: { productType: 'PASSENGER', carHeightMm: 2300 },
    calcInput: { productType: 'PASSENGER', stops: 8 },
    pricingBreakdown: null,
    subtotalEtb: '100000.00',
    marginPercent: '25.00',
    marginAmountEtb: '25000.00',
    taxPercent: '15.00',
    taxAmountEtb: '18750.00',
    totalPriceEtb: '143750.00',
    notes: null,
  };

  const quotationsService = { getDocumentData: jest.fn() };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const documentContent = {
    get: jest.fn<Promise<DocumentAppendixContent>, [string]>(async () => ({
      boilerplate: [],
      components: [],
    })),
  };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };
  const res = { end: jest.fn() };

  const controller = new QuotationsController(
    quotationsService as unknown as QuotationsService,
    pdfService as unknown as DocumentPdfService,
    docxService,
    tenantBranding as unknown as TenantBrandingProvider,
    documentContent as unknown as DocumentContentProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    quotationsService.getDocumentData.mockResolvedValue(row);
    tenantBranding.get.mockResolvedValue(branding);
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));
  });

  it('renders the technical-proposal template and writes technical-proposal-<quoteNumber>.pdf headers', async () => {
    await controller.technicalProposal(user, 'id', 'pdf', res as never);

    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'technical-proposal',
      expect.objectContaining({
        quoteNumber: 'QTN-2026-ABCD1234',
        calcInput: { productType: 'PASSENGER', stops: 8 },
      }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'technical-proposal-QTN-2026-ABCD1234',
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('never puts a price on the wire', async () => {
    await controller.technicalProposal(user, 'id', 'pdf', res as never);

    const [, data] = pdfService.renderDocumentPdf.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(data)).not.toContain('totalPriceEtb');
    expect(Object.keys(data)).not.toContain('pricingBreakdown');
  });

  it.each(['docx', 'xlsx', 'csv', undefined])(
    'rejects format=%s with a 400 before touching the service',
    async (format) => {
      await expect(
        controller.technicalProposal(user, 'id', format, res as never),
      ).rejects.toThrow(BadRequestException);
      expect(quotationsService.getDocumentData).not.toHaveBeenCalled();
    },
  );
});
