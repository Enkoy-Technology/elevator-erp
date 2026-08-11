import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { WithholdingDto } from './withholding.dto';

const validateField = async (dto: Record<string, unknown>, property: string) => {
  const instance = plainToInstance(WithholdingDto, dto);
  const errors = await validate(instance);
  return errors.filter((e) => e.property === property);
};

describe('WithholdingDto.amountEtb — B2: zero must be correctable', () => {
  it('accepts "0.00" — the only way to correct a mis-keyed voucher away entirely', async () => {
    expect(await validateField({ amountEtb: '0.00' }, 'amountEtb')).toHaveLength(0);
  });

  it('still accepts an ordinary positive amount', async () => {
    expect(await validateField({ amountEtb: '3.00' }, 'amountEtb')).toHaveLength(0);
  });

  it('still rejects a negative amount', async () => {
    expect(await validateField({ amountEtb: '-3.00' }, 'amountEtb')).not.toHaveLength(0);
  });

  it('still rejects more than 2 decimal places', async () => {
    expect(await validateField({ amountEtb: '3.001' }, 'amountEtb')).not.toHaveLength(0);
  });
});

describe('WithholdingDto.recordedAt — R3: rejects a far-future date', () => {
  it('accepts today', async () => {
    expect(
      await validateField({ amountEtb: '3.00', recordedAt: new Date().toISOString() }, 'recordedAt'),
    ).toHaveLength(0);
  });

  it('accepts tomorrow', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(await validateField({ amountEtb: '3.00', recordedAt: tomorrow }, 'recordedAt')).toHaveLength(0);
  });

  it('rejects next year', async () => {
    const nextYear = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      await validateField({ amountEtb: '3.00', recordedAt: nextYear }, 'recordedAt'),
    ).not.toHaveLength(0);
  });
});
