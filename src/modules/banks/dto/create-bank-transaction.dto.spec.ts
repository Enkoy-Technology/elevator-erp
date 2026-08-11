import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBankTransactionDto } from './create-bank-transaction.dto';

const base = {
  amountEtb: '-1500.00',
  kind: 'WITHDRAWAL',
};

const validateTxDate = async (dto: Record<string, unknown>) => {
  const instance = plainToInstance(CreateBankTransactionDto, dto);
  const errors = await validate(instance);
  return errors.filter((e) => e.property === 'txDate');
};

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

describe('CreateBankTransactionDto.txDate — fix-wave-c #2: rejects a far-future date (a year typo must not silently move the account balance)', () => {
  it('accepts today', async () => {
    expect(await validateTxDate({ ...base, txDate: dateOnly(new Date()) })).toHaveLength(0);
  });

  it('accepts tomorrow', async () => {
    const tomorrow = dateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(await validateTxDate({ ...base, txDate: tomorrow })).toHaveLength(0);
  });

  it('rejects next year', async () => {
    const nextYear = dateOnly(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    expect(await validateTxDate({ ...base, txDate: nextYear })).not.toHaveLength(0);
  });
});
