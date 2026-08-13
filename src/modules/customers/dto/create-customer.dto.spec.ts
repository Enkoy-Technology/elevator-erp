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
    const dto = plainToInstance(CreateCustomerDto, { ...base, phone: '0911 2345' });
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

  it('CreateCustomerDto accepts an absent phone — it is optional', async () => {
    const dto = plainToInstance(CreateCustomerDto, base);
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).toHaveLength(0);
  });

  it('UpdateCustomerDto (PartialType) inherits the same validation', async () => {
    const dto = plainToInstance(UpdateCustomerDto, { phone: 'not-a-phone' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });
});
