import zlib from 'node:zlib';

import { TemplateNotImplementedError } from '../exceptions';
import { DocumentDocxService } from './document-docx.service';
import type { TenantBranding } from './document-pdf.service';
import type { QuotationTemplateData } from './templates/quotation.template';

/**
 * `docx`'s output is a real PK zip (OOXML), but the package ships no reader
 * — and the project has no jszip/unzipper of its own (both are transitive
 * deps of `exceljs`/`docx`, invisible to this package's own `require()`
 * under pnpm's default strict node_modules layout — verified: neither
 * resolves from here). Rather than add a new dependency just for this test,
 * this reads the entry directly with two Node builtins already in every
 * runtime: manual ZIP central-directory parsing (`Buffer` reads) plus
 * `zlib.inflateRawSync` for the DEFLATE-compressed entries `docx` produces.
 * Verified against a real `Packer.toBuffer()` output before trusting it here.
 */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

const extractZipEntry = (buf: Buffer, entryName: string): Buffer => {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('not a zip: end-of-central-directory record not found');
  }
  const centralDirectoryOffset = buf.readUInt32LE(eocdOffset + 16);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);

  let offset = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`malformed central directory entry at offset ${offset}`);
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      const localNameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      // 0 = stored (no compression), 8 = deflate — the only two methods a
      // ZIP writer like docx's realistically emits.
      return compressionMethod === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`zip entry not found: ${entryName}`);
};

describe('DocumentDocxService.renderDocumentDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const data: QuotationTemplateData = {
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'APPROVED',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    validUntil: new Date('2026-09-30T00:00:00.000Z'),
    marginPercent: '25.00',
    taxPercent: '15.00',
    subtotalEtb: '100000.00',
    marginAmountEtb: '25000.00',
    taxAmountEtb: '18750.00',
    totalPriceEtb: '143750.00',
    notes: 'Includes 12-month warranty',
    technicalSpec: { capacityPersons: 13, motorPowerKw: '11.00' },
    pricingBreakdown: { baseCost: '80000.00', installationCost: '20000.00' },
    projectName: 'Bole Twin Towers — Lift A',
    customerName: 'ኤሌቬተር ማንሻ',
  };

  it('throws TemplateNotImplementedError for a template with no registered builder yet', async () => {
    const service = new DocumentDocxService();
    await expect(service.renderDocumentDocx('invoice', {}, branding)).rejects.toBeInstanceOf(
      TemplateNotImplementedError,
    );
  });

  it('names the rejected template in the error message', async () => {
    const service = new DocumentDocxService();
    await expect(service.renderDocumentDocx('contract', {}, branding)).rejects.toThrow(
      /contract/,
    );
  });

  it('renders a quotation as a real docx (PK zip) Buffer', async () => {
    const service = new DocumentDocxService();
    const buf = await service.renderDocumentDocx('quotation', data, branding);

    expect(Buffer.isBuffer(buf)).toBe(true);
    // Local file header magic (PK\x03\x04), present at the start of every
    // non-empty ZIP (and therefore every .docx). Asserted as explicit bytes,
    // not a string literal — a string containing the raw 0x03/0x04
    // control bytes reads as "PK" in a diff/editor while asserting more.
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(buf.length).toBeGreaterThan(1024);

    const documentXml = extractZipEntry(buf, 'word/document.xml').toString('utf8');
    // The Amharic customer name and the verbatim total money string both
    // made it into the actual OOXML document part, not just the in-memory
    // Document object Packer.toBuffer() consumed.
    expect(documentXml).toContain('ኤሌቬተር ማንሻ');
    expect(documentXml).toContain('143750.00');
  });
});
