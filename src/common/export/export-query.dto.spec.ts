import { BadRequestException } from '@nestjs/common';

import { parseExportFormat, parseReportFormat } from './export-query.dto';

describe('parseExportFormat', () => {
  it('returns undefined when format is absent', () => {
    expect(parseExportFormat(undefined)).toBeUndefined();
  });

  it('treats an empty string the same as absent, instead of 400ing it', () => {
    expect(parseExportFormat('')).toBeUndefined();
  });

  it('accepts each supported format', () => {
    expect(parseExportFormat('csv')).toBe('csv');
    expect(parseExportFormat('xlsx')).toBe('xlsx');
  });

  it('rejects an unsupported format with a 400', () => {
    expect(() => parseExportFormat('pdf')).toThrow(BadRequestException);
    expect(() => parseExportFormat('pdf')).toThrow(/format must be one of/);
  });
});

describe('parseReportFormat', () => {
  it('returns undefined when format is absent or empty', () => {
    expect(parseReportFormat(undefined)).toBeUndefined();
    expect(parseReportFormat('')).toBeUndefined();
  });

  it('accepts csv, xlsx, and pdf', () => {
    expect(parseReportFormat('csv')).toBe('csv');
    expect(parseReportFormat('xlsx')).toBe('xlsx');
    expect(parseReportFormat('pdf')).toBe('pdf');
  });

  it('rejects an unsupported format with a 400', () => {
    expect(() => parseReportFormat('docx')).toThrow(BadRequestException);
    expect(() => parseReportFormat('docx')).toThrow(/format must be one of/);
  });
});
