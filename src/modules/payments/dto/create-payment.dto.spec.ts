import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePaymentDto } from './create-payment.dto';

const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BANK_ACCOUNT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const base = {
  customerId: CUSTOMER_ID,
  amountEtb: '112.00',
};

const validateBankAccountId = async (dto: Record<string, unknown>) => {
  const instance = plainToInstance(CreatePaymentDto, dto);
  const errors = await validate(instance);
  return errors.filter((e) => e.property === 'bankAccountId');
};

describe('CreatePaymentDto — bankAccountId required per method (brief 3.1)', () => {
  it('CASH may omit bankAccountId', async () => {
    expect(await validateBankAccountId({ ...base, method: 'CASH' })).toHaveLength(0);
  });

  it('OTHER may omit bankAccountId', async () => {
    expect(await validateBankAccountId({ ...base, method: 'OTHER' })).toHaveLength(0);
  });

  it.each(['BANK_TRANSFER', 'CHEQUE', 'CBE_BIRR', 'TELEBIRR'])(
    '%s without bankAccountId fails validation',
    async (method) => {
      expect(await validateBankAccountId({ ...base, method })).not.toHaveLength(0);
    },
  );

  it.each(['BANK_TRANSFER', 'CHEQUE', 'CBE_BIRR', 'TELEBIRR'])(
    '%s with a valid bankAccountId passes',
    async (method) => {
      expect(
        await validateBankAccountId({ ...base, method, bankAccountId: BANK_ACCOUNT_ID }),
      ).toHaveLength(0);
    },
  );

  it('a non-UUID bankAccountId fails even for CASH (format still checked when provided)', async () => {
    expect(
      await validateBankAccountId({ ...base, method: 'CASH', bankAccountId: 'not-a-uuid' }),
    ).not.toHaveLength(0);
  });
});
