import { BadRequestException } from '@nestjs/common';

import { parseExportFormat } from './export-query.dto';

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
