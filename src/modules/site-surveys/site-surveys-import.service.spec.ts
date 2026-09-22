import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { ImportSiteSurveysResultDto } from './dto/import-site-surveys.dto';
import type { NotificationsRepository } from '../notifications/notifications.repository';
import { SiteSurveysImportService } from './site-surveys-import.service';
import type { SiteSurveysRepository } from './site-surveys.repository';

const user: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'SALESPERSON',
};

const repo = {
  createMany: jest.fn<Promise<number>, [string, string, unknown[]]>(),
  listManagerIds: jest.fn<Promise<string[]>, [string]>(),
};

const notifications = { create: jest.fn() };

const service = new SiteSurveysImportService(
  repo as unknown as SiteSurveysRepository,
  notifications as unknown as NotificationsRepository,
);

/** The client's own files, byte for byte — not a spreadsheet we wrote. */
const fixture = (name: string): { originalname: string; buffer: Buffer } => ({
  originalname: name,
  buffer: readFileSync(join(__dirname, '__fixtures__', name)),
});

const csv = (body: string): { originalname: string; buffer: Buffer } => ({
  originalname: 'form.csv',
  buffer: Buffer.from(body, 'utf8'),
});

const run = (
  file: { originalname: string; buffer: Buffer },
  commit = false,
): Promise<ImportSiteSurveysResultDto> => service.import(user, file, commit);

beforeEach(() => {
  jest.clearAllMocks();
  repo.createMany.mockImplementation(async (_t, _u, rows) => rows.length);
  repo.listManagerIds.mockResolvedValue(['gm-1']);
  notifications.create.mockResolvedValue({});
});

describe('the manager is told once per upload', () => {
  it('sends one notification naming the sites, not one per row', async () => {
    await run(fixture('site-form-filled.xlsx'), true);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    const [, , dto] = notifications.create.mock.calls[0] as [
      string,
      string,
      { title: string; body: string },
    ];
    expect(dto.title).toBe('2 site surveys imported');
    expect(dto.body).toBe('Belachew, Getachew');
  });

  it('says nothing on a dry run', async () => {
    await run(fixture('site-form-filled.xlsx'), false);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps the imported sheets when the managers cannot be told', async () => {
    repo.listManagerIds.mockRejectedValue(new Error('database is away'));

    await expect(
      run(fixture('site-form-filled.xlsx'), true),
    ).resolves.toMatchObject({ imported: 2 });
  });
});

describe('SiteSurveysImportService — the real SITE COLLECTION FORM', () => {
  it('reads the two filled rows, merged headers and all', async () => {
    const result = await run(fixture('site-form-filled.xlsx'));

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.dryRun).toBe(true);
    expect(result.imported).toBe(0);
    expect(result.rows).toEqual([
      {
        rowNumber: 6,
        projectName: 'Belachew',
        address: null,
        contactName: 'Belachew',
        contactPhone: null,
        shaftWidthCm: 200,
        shaftDepthCm: 180,
        floors: 'B+G+11',
        overheadCm: null,
        machineRoom: 'With MR',
        units: null,
      },
      {
        rowNumber: 7,
        projectName: 'Getachew',
        address: null,
        contactName: 'Getachew',
        contactPhone: null,
        shaftWidthCm: 180,
        shaftDepthCm: 240,
        floors: 'B+G+16',
        overheadCm: null,
        machineRoom: 'With MR',
        units: null,
      },
    ]);
  });

  it('writes nothing on a dry run and both rows on commit', async () => {
    await run(fixture('site-form-filled.xlsx'));
    expect(repo.createMany).not.toHaveBeenCalled();

    const result = await run(fixture('site-form-filled.xlsx'), true);
    expect(result.dryRun).toBe(false);
    expect(result.imported).toBe(2);
    const [tenantId, userId, payloads] = repo.createMany.mock.calls[0] ?? [];
    expect(tenantId).toBe(user.tenantId);
    expect(userId).toBe(user.userId);
    expect(payloads).toHaveLength(2);
    // Attributed to the uploader and dated today by the repository — the
    // "Betelhem tesfa and nafyad" scribbled in row 3 is not read.
    expect(payloads?.[0]).toHaveProperty('surveyDate', undefined);
  });

  it('finds nothing to import in the blank form, and does not call it an error', async () => {
    const result = await run(fixture('site-form-blank.xlsx'));

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

describe('SiteSurveysImportService — bad input', () => {
  const header =
    'PROJECT NAME,ADDRESS,CONTACT PERSON,,SHAFT DATA,,FLOORS,OH,Machine room,UNITS\n' +
    'PROJECT NAME,ADDRESS,name,telephone,width,depth,FLOORS,OH,Machine room,UNITS\n';

  it('rejects a file with no project name column, naming what it expected', async () => {
    await expect(run(csv('Name,Notes\nBole,tall\n'))).rejects.toThrow(
      /PROJECT NAME/,
    );
  });

  it('takes 200.0 and 1,850 as numbers, and reports a word as a row error', async () => {
    const result = await run(
      csv(
        header +
          'Bole Plaza,,,,200.0,"1,850",B+G+11,,With MR,2\n' +
          'Kazanchis,,,,wide,180,B+G+4,,MRL,1\n',
      ),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 3,
      projectName: 'Bole Plaza',
      shaftWidthCm: 200,
      shaftDepthCm: 1850,
      units: 2,
    });
    expect(result.errors).toEqual([
      { row: 4, message: 'shaft width cm: "wide" is not a number.' },
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('rejects a row the API itself would reject, and imports the rest', async () => {
    const result = await run(
      csv(
        header +
          'Bole Plaza,,Ato Abebe,0911234567,,,,,,\n' +
          'Kazanchis,,Ato Kebede,12345,,,,,,\n',
      ),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.contactPhone).toBe('0911234567');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.row).toBe(4);
  });

  it('names the sheet column in a validation error, not the DTO property', async () => {
    const result = await run(
      csv(
        header +
          'Bole Plaza,,,,99999,180,,,,\n' +
          'Kazanchis,,Ato Kebede,12345,,,,,,\n' +
          ',,,,200,180,B+G+4,,,\n',
      ),
    );

    expect(result.errors.map((e) => e.message)).toEqual([
      'shaft width cm must not be greater than 2000',
      'contact phone must be a recognisable Ethiopian phone number (e.g. 0911234567 or +251911234567)',
      'PROJECT NAME is required.',
    ]);
  });

  it('will not read 1e3 or 0x10 as a measurement', async () => {
    const result = await run(csv(header + 'Bole Plaza,,,,1e3,0x10,,,,\n'));

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { row: 3, message: 'shaft width cm: "1e3" is not a number.' },
    ]);
  });

  /**
   * The same form with the CONTACT PERSON and SHAFT DATA groups removed: every
   * remaining column repeats its own label in the sub-header row, so nothing
   * proves row 2 is a header except the words in it.
   */
  it('does not import a repeated header row as a survey called PROJECT NAME', async () => {
    const result = await run(
      csv(
        'PROJECT NAME,ADDRESS,FLOORS,Machine room,UNITS\n' +
          'PROJECT NAME,ADDRESS,FLOORS,Machine room,UNITS\n' +
          'Bole Plaza,Bole,B+G+11,With MR,2\n',
      ),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 3,
      projectName: 'Bole Plaza',
      address: 'Bole',
      floors: 'B+G+11',
      machineRoom: 'With MR',
      units: 2,
    });
  });

  it('skips blank spacer rows without counting them', async () => {
    const result = await run(
      csv(header + ',,,,,,,,,\nBole Plaza,,,,,,,,,\n,,,,,,,,,\n'),
    );

    expect(result.totalRows).toBe(1);
    expect(result.rows[0]?.rowNumber).toBe(4);
  });
});
