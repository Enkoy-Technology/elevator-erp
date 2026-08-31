import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateEmployeeDto, UpdateEmployeeDto } from './employee.dto';

const validatePassword = async (password: string | undefined) => {
  const dto = plainToInstance(UpdateEmployeeDto, { password });
  return validate(dto);
};

describe('UpdateEmployeeDto password', () => {
  it('accepts a valid password', async () => {
    const errors = await validatePassword('NewTempPass!123');
    expect(errors.filter((e) => e.property === 'password')).toHaveLength(0);
  });

  it('rejects a too-short password', async () => {
    const errors = await validatePassword('short');
    expect(
      errors.filter((e) => e.property === 'password'),
    ).not.toHaveLength(0);
  });

  it('accepts an absent password — it is optional', async () => {
    const errors = await validatePassword(undefined);
    expect(errors.filter((e) => e.property === 'password')).toHaveLength(0);
  });
});

// I4: proves @Validate(IsEthiopianPhoneConstraint) is actually wired onto
// the field, not just that the constraint class itself works in isolation
// (see common/dto/phone.spec.ts for that).
describe('CreateEmployeeDto/UpdateEmployeeDto phone', () => {
  const base = {
    email: 'sales@shiningstar.et',
    fullName: 'Abebe Kebede',
    role: 'SALES_MANAGER',
    password: 'TempPass!123',
  };

  it('CreateEmployeeDto rejects a malformed phone', async () => {
    const dto = plainToInstance(CreateEmployeeDto, { ...base, phone: '0911 2345' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });

  it('CreateEmployeeDto accepts a valid phone', async () => {
    const dto = plainToInstance(CreateEmployeeDto, { ...base, phone: '0911234567' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).toHaveLength(0);
  });

  it('UpdateEmployeeDto rejects a malformed phone', async () => {
    const dto = plainToInstance(UpdateEmployeeDto, { phone: 'not-a-phone' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'phone')).not.toHaveLength(0);
  });
});

// nit fix: employees can now record consent at creation, matching customers.
describe('CreateEmployeeDto smsConsentGiven', () => {
  it('accepts a boolean', async () => {
    const dto = plainToInstance(CreateEmployeeDto, {
      email: 'sales@shiningstar.et',
      fullName: 'Abebe Kebede',
      role: 'SALES_MANAGER',
      password: 'TempPass!123',
      smsConsentGiven: true,
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'smsConsentGiven')).toHaveLength(0);
  });
});
