import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateEmployeeDto } from './employee.dto';

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
