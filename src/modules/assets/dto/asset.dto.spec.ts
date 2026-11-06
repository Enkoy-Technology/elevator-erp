import { ValidationPipe } from '@nestjs/common';

import { UpdateAssetDto } from './asset.dto';

// The same options as main.ts: a field the DTO does not list is refused.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validate = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: UpdateAssetDto });

describe('UpdateAssetDto', () => {
  it('accepts the plain fields of the edit page', async () => {
    await expect(validate({ name: 'Lift A' })).resolves.toBeDefined();
  });

  it('refuses status: only the status steps change it', async () => {
    await expect(validate({ status: 'ACTIVE' })).rejects.toBeDefined();
  });

  it('refuses the project link: it is part of who a lift is sold to', async () => {
    await expect(validate({ projectId: null })).rejects.toBeDefined();
  });
});
