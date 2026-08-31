import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateNotificationDto } from './notification.dto';

const BASE = {
  userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  title: 'You were assigned to a project',
};

const validateLinkPath = async (linkPath: string) => {
  const dto = plainToInstance(CreateNotificationDto, { ...BASE, linkPath });
  return validate(dto);
};

describe('CreateNotificationDto linkPath', () => {
  it('accepts an in-app relative path', async () => {
    const errors = await validateLinkPath('/maintenance/contracts/123');
    expect(errors).toHaveLength(0);
  });

  it('rejects an absolute external URL', async () => {
    const errors = await validateLinkPath('https://evil.example');
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a javascript: URL', async () => {
    const errors = await validateLinkPath('javascript:alert(1)');
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a protocol-relative URL', async () => {
    const errors = await validateLinkPath('//evil.example');
    expect(errors).not.toHaveLength(0);
  });
});
