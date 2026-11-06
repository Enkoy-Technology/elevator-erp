import { ValidationPipe } from '@nestjs/common';

import {
  CreateAssetDto,
  MarkChecklistCaseDto,
  UpdateAssetDto,
  UpdateChecklistItemDto,
} from './asset.dto';

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

describe('CreateAssetDto.missingParts', () => {
  const validateCreate = (missingParts: unknown) =>
    pipe.transform(
      { category: 'ELEVATOR', name: 'Lift A', missingParts },
      { type: 'body', metatype: CreateAssetDto },
    );

  it('takes the keys of the parts that did not arrive', async () => {
    await expect(validateCreate(['1/2', '5/F3'])).resolves.toBeDefined();
  });

  it('refuses anything but a short list of short strings', async () => {
    await expect(validateCreate('1/2')).rejects.toBeDefined();
    await expect(validateCreate([1])).rejects.toBeDefined();
    await expect(validateCreate(['x'.repeat(21)])).rejects.toBeDefined();
    await expect(
      validateCreate(Array.from({ length: 201 }, () => '1/2')),
    ).rejects.toBeDefined();
  });
});

describe('MarkChecklistCaseDto', () => {
  const validateMark = (mark: unknown) =>
    pipe.transform({ mark }, { type: 'body', metatype: MarkChecklistCaseDto });

  it('takes a tick or an untick and nothing else', async () => {
    await expect(validateMark('OK')).resolves.toBeDefined();
    await expect(validateMark('MISSING')).resolves.toBeDefined();
    await expect(validateMark('DAMAGED')).rejects.toBeDefined();
    await expect(validateMark(null)).rejects.toBeDefined();
  });
});

describe('UpdateChecklistItemDto', () => {
  const validateItem = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: UpdateChecklistItemDto });

  it('takes a tick or an untick, and refuses clearing it or the old marks', async () => {
    await expect(validateItem({ mark: 'OK' })).resolves.toBeDefined();
    await expect(validateItem({ mark: 'MISSING' })).resolves.toBeDefined();
    await expect(validateItem({ mark: 'DAMAGED' })).rejects.toBeDefined();
    await expect(validateItem({ mark: 'NOT_INCLUDED' })).rejects.toBeDefined();
    await expect(validateItem({ mark: null })).rejects.toBeDefined();
  });
});
