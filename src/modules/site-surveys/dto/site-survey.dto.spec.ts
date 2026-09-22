import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateSiteSurveyDto } from './site-survey.dto';

const check = (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateSiteSurveyDto, payload));

describe('CreateSiteSurveyDto', () => {
  it('accepts a sheet with nothing but the project name', async () => {
    expect(await check({ projectName: 'Bole Plaza' })).toHaveLength(0);
  });

  it('requires the project name', async () => {
    expect(await check({ floors: 'B+G+11' })).not.toHaveLength(0);
  });

  it('keeps floors as free text, unparsed', async () => {
    const dto = plainToInstance(CreateSiteSurveyDto, {
      projectName: 'Bole Plaza',
      floors: '2B+G+11M',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.floors).toBe('2B+G+11M');
  });

  it('rejects a phone number the SMS layer could not dial', async () => {
    expect(
      await check({ projectName: 'Bole Plaza', contactPhone: '12345' }),
    ).not.toHaveLength(0);
    expect(
      await check({ projectName: 'Bole Plaza', contactPhone: '0911234567' }),
    ).toHaveLength(0);
  });

  it('rejects an impossible date and a non-integer measurement', async () => {
    expect(
      await check({ projectName: 'Bole Plaza', surveyDate: '2026-02-30' }),
    ).not.toHaveLength(0);
    expect(
      await check({ projectName: 'Bole Plaza', shaftWidthCm: 1.5 }),
    ).not.toHaveLength(0);
  });
});
