import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';

// I4: proves @Validate(IsEthiopianPhoneConstraint) is actually wired onto
// the field, not just that the constraint class itself works in isolation
// (see common/dto/phone.spec.ts for that) — a bad number stored here is a
// reminder that silently never arrives, forever.
describe('CreateCustomerDto/UpdateCustomerDto phone', () => {
  const base = { name: 'Addis Heights PLC' };

  it('CreateCustomerDto rejects a malformed phone', async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...base,
      phone: '0911 2345',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });

  it('CreateCustomerDto accepts the forms staff actually type', async () => {
    for (const phone of ['0911234567', '+251911234567', '0911 234 567']) {
      const dto = plainToInstance(CreateCustomerDto, { ...base, phone });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'phone')).toHaveLength(0);
    }
  });

  it('CreateCustomerDto refuses an absent phone — every customer is reachable', async () => {
    const dto = plainToInstance(CreateCustomerDto, base);
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });

  it('UpdateCustomerDto (PartialType) inherits the same validation', async () => {
    const dto = plainToInstance(UpdateCustomerDto, { phone: 'not-a-phone' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });
});

describe('CreateCustomerDto tinNumber', () => {
  const base = { name: 'Addis Heights PLC', phone: '0911234567' };
  const tinErrors = async (input: object) =>
    (await validate(plainToInstance(CreateCustomerDto, input))).filter(
      (e) => e.property === 'tinNumber',
    );

  it('is optional — absent and null both pass', async () => {
    expect(await tinErrors(base)).toHaveLength(0);
    expect(await tinErrors({ ...base, tinNumber: null })).toHaveLength(0);
  });

  it('still has to be the 10-digit TIN when given', async () => {
    expect(await tinErrors({ ...base, tinNumber: '0067673517' })).toHaveLength(
      0,
    );
    expect(await tinErrors({ ...base, tinNumber: '12345' })).not.toHaveLength(
      0,
    );
    expect(await tinErrors({ ...base, tinNumber: '' })).not.toHaveLength(0);
  });
});
