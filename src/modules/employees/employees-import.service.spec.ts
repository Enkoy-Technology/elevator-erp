import ExcelJS from 'exceljs';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { ImportEmployeesResultDto } from './dto/import-employees.dto';
import { USER_ROLES } from '../../types/auth.types';
import {
  EmployeesImportService,
  IMPORTABLE_ROLES,
  mapHeaders,
  normalizeRole,
} from './employees-import.service';
import type { EmployeesRepository } from './employees.repository';

const user: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'ADMIN',
};

type CreateManyRecord = {
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  passwordHash: string;
};

const repo = {
  findExistingEmails: jest.fn<Promise<Set<string>>, [string, readonly string[]]>(),
  createMany: jest.fn<Promise<Set<string>>, [string, CreateManyRecord[]]>(),
};

const service = new EmployeesImportService(
  repo as unknown as EmployeesRepository,
);

const csv = (body: string): { originalname: string; buffer: Buffer } => ({
  originalname: 'staff.csv',
  buffer: Buffer.from(body, 'utf8'),
});

const runCsv = (
  body: string,
  commit = false,
): Promise<ImportEmployeesResultDto> => service.import(user, csv(body), commit);

const rowFor = (
  result: ImportEmployeesResultDto,
  email: string,
): ImportEmployeesResultDto['rows'][number] => {
  const row = result.rows.find((r) => r.email?.toLowerCase() === email);
  if (!row) {
    throw new Error(`no row for ${email} in ${JSON.stringify(result.rows)}`);
  }
  return row;
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.findExistingEmails.mockResolvedValue(new Set());
  repo.createMany.mockImplementation((_tenantId, records) =>
    Promise.resolve(new Set(records.map((record) => record.email))),
  );
});

describe('header mapping', () => {
  it('matches synonyms case-insensitively, ignoring punctuation and unknown columns', () => {
    expect(
      mapHeaders(['  E-Mail ', 'Full name', 'Position', 'Mobile No', 'Salary']),
    ).toEqual({ email: 0, fullName: 1, role: 2, phone: 3 });
  });

  it('reads a real sheet through those synonyms', async () => {
    const result = await runCsv(
      'E-mail,Full Name,Position,Telephone,Department\n' +
        'Abebe@ShiningStar.et,Abebe Kebede,sales manager,0911234567,Sales\n',
    );

    expect(result.dryRun).toBe(true);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      fullName: 'Abebe Kebede',
      email: 'Abebe@ShiningStar.et',
      role: 'sales manager',
      status: 'READY',
    });
  });

  it('rejects a sheet with no email/name/role column, naming what it found', async () => {
    await expect(runCsv('Staff,Dept\nAbebe,Sales\n')).rejects.toThrow(
      /missing a column for: fullName, email, role.*Staff, Dept/s,
    );
  });
});

describe('role mapping', () => {
  it('is forgiving about case and spacing', () => {
    expect(normalizeRole('sales manager')).toBe('SALES_MANAGER');
    expect(normalizeRole('  Field-Engineer ')).toBe('FIELD_ENGINEER');
    expect(normalizeRole('FINANCE')).toBe('FINANCE');
  });

  it('refuses roles it cannot place', () => {
    expect(normalizeRole('Chief Elevator Whisperer')).toBeNull();
    expect(normalizeRole('')).toBeNull();
  });

  it('errors the row and lists the valid roles', async () => {
    const result = await runCsv(
      'Name,Email,Role\nAbebe Kebede,abebe@shiningstar.et,Chief Whisperer\n',
    );

    const row = rowFor(result, 'abebe@shiningstar.et');
    expect(row.status).toBe('ERROR');
    expect(row.message).toContain('SALES_MANAGER');
    expect(row.message).toContain('Chief Whisperer');
    // The role is echoed exactly as written so the admin can find it in the sheet.
    expect(row.role).toBe('Chief Whisperer');
  });
});

describe('CEO/ADMIN cannot be granted by import', () => {
  it.each(['CEO', 'ceo', 'Admin', 'ADMIN'])(
    'refuses %s with a message saying why',
    async (role) => {
      const result = await runCsv(
        `Name,Email,Role\nAbebe Kebede,abebe@shiningstar.et,${role}\n`,
      );

      const row = rowFor(result, 'abebe@shiningstar.et');
      expect(row.status).toBe('ERROR');
      expect(row.message).toMatch(/CEO and ADMIN must be added one at a time/);
    },
  );

  it('keeps CEO and ADMIN out of the importable role list entirely', () => {
    expect(IMPORTABLE_ROLES).not.toContain('CEO');
    expect(IMPORTABLE_ROLES).not.toContain('GENERAL_MANAGER');
    expect(IMPORTABLE_ROLES).not.toContain('ADMIN');
    expect(IMPORTABLE_ROLES).not.toContain('CUSTOMER');
    // The list is built by SUBTRACTION from USER_ROLES, so a role added to
    // the enum is importable unless someone remembers to exclude it — which
    // is exactly how GENERAL_MANAGER briefly became grantable by
    // spreadsheet. Asserting the COUNT means the next role added forces a
    // decision here rather than defaulting to "anyone can be granted this".
    expect(IMPORTABLE_ROLES).toHaveLength(USER_ROLES.length - 4);
    expect(IMPORTABLE_ROLES).toContain('SALES_MANAGER');
  });
});

describe('duplicates', () => {
  it('a repeat inside the file is an ERROR on the second occurrence only', async () => {
    const result = await runCsv(
      'Name,Email,Role\n' +
        'Abebe Kebede,abebe@shiningstar.et,FINANCE\n' +
        'Abebe K.,ABEBE@shiningstar.et,DISPATCHER\n',
    );

    expect(result.rows[0]?.status).toBe('READY');
    expect(result.rows[1]?.status).toBe('ERROR');
    expect(result.rows[1]?.message).toMatch(/appears more than once/);
  });

  it('a repeat against the database is SKIPPED_DUPLICATE, not an error', async () => {
    repo.findExistingEmails.mockResolvedValue(
      new Set(['abebe@shiningstar.et']),
    );

    const result = await runCsv(
      'Name,Email,Role\n' +
        'Abebe Kebede,abebe@shiningstar.et,FINANCE\n' +
        'Kebede Alemu,kebede@shiningstar.et,DISPATCHER\n',
    );

    expect(rowFor(result, 'abebe@shiningstar.et').status).toBe(
      'SKIPPED_DUPLICATE',
    );
    expect(rowFor(result, 'abebe@shiningstar.et').message).toMatch(
      /left unchanged/,
    );
    expect(rowFor(result, 'kebede@shiningstar.et').status).toBe('READY');
  });

  it('re-running a fully imported file writes nothing and fails nothing', async () => {
    repo.findExistingEmails.mockResolvedValue(
      new Set(['abebe@shiningstar.et']),
    );

    const result = await runCsv(
      'Name,Email,Role\nAbebe Kebede,abebe@shiningstar.et,FINANCE\n',
      true,
    );

    expect(result.created).toBe(0);
    expect(repo.createMany).toHaveBeenCalledWith(user.tenantId, []);
    expect(result.rows[0]?.status).toBe('SKIPPED_DUPLICATE');
  });
});

describe('blank rows and stray whitespace', () => {
  it('skips fully blank rows instead of reporting them', async () => {
    const result = await runCsv(
      'Name,Email,Role\n' +
        '\n' +
        'Abebe Kebede,abebe@shiningstar.et,FINANCE\n' +
        ',,\n' +
        '   ,  ,\n' +
        'Kebede Alemu,kebede@shiningstar.et,DISPATCHER\n',
    );

    expect(result.totalRows).toBe(2);
    expect(result.rows.map((r) => r.status)).toEqual(['READY', 'READY']);
    // Row numbers still point at the real lines in the sheet.
    expect(result.rows.map((r) => r.rowNumber)).toEqual([3, 6]);
  });
});

describe('row validation reuses CreateEmployeeDto', () => {
  it('rejects a malformed email', async () => {
    const result = await runCsv('Name,Email,Role\nAbebe,not-an-email,FINANCE\n');

    expect(result.rows[0]?.status).toBe('ERROR');
    expect(result.rows[0]?.message).toMatch(/email/i);
  });

  it('rejects a phone the Ethiopian validator will not take', async () => {
    const result = await runCsv(
      'Name,Email,Role,Phone\nAbebe Kebede,abebe@shiningstar.et,FINANCE,+1 555 0100\n',
    );

    expect(result.rows[0]?.status).toBe('ERROR');
    expect(result.rows[0]?.message).toMatch(/Ethiopian phone number/);
  });

  it('accepts a blank phone', async () => {
    const result = await runCsv(
      'Name,Email,Role,Phone\nAbebe Kebede,abebe@shiningstar.et,FINANCE,\n',
    );

    expect(result.rows[0]?.status).toBe('READY');
  });
});

describe('csv parsing', () => {
  it('a comma inside a quoted field does not split the row', async () => {
    const result = await runCsv(
      'Name,Email,Role\n"Kebede, Abebe",abebe@shiningstar.et,FINANCE\n',
    );

    expect(result.rows[0]).toMatchObject({
      fullName: 'Kebede, Abebe',
      email: 'abebe@shiningstar.et',
      status: 'READY',
    });
  });

  it('reads .xlsx through the same path', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Staff');
    sheet.addRow(['Full Name', 'Email', 'Position']);
    sheet.addRow(['Abebe Kebede', 'abebe@shiningstar.et', 'Sales Manager']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.import(
      user,
      { originalname: 'staff.xlsx', buffer },
      false,
    );

    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toMatchObject({
      fullName: 'Abebe Kebede',
      email: 'abebe@shiningstar.et',
      status: 'READY',
    });
  });
});

describe('dry run vs commit', () => {
  const twoGoodRows =
    'Name,Email,Role,Phone\n' +
    'Abebe Kebede,abebe@shiningstar.et,FINANCE,0911234567\n' +
    'Kebede Alemu,kebede@shiningstar.et,dispatcher,\n';

  it('a dry run writes nothing and hands out no passwords', async () => {
    const result = await runCsv(twoGoodRows);

    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(0);
    expect(repo.createMany).not.toHaveBeenCalled();
    expect(result.rows.every((r) => r.status === 'READY')).toBe(true);
    expect(result.rows.every((r) => r.temporaryPassword === undefined)).toBe(
      true,
    );
  });

  it('anything other than commit=true stays a dry run', async () => {
    for (const result of [
      await runCsv(twoGoodRows, false),
      await service.import(user, csv(twoGoodRows), false),
    ]) {
      expect(result.dryRun).toBe(true);
      expect(repo.createMany).not.toHaveBeenCalled();
    }
  });

  it('commit creates the rows and returns each generated password once', async () => {
    const result = await runCsv(twoGoodRows, true);

    expect(result.dryRun).toBe(false);
    expect(result.created).toBe(2);
    for (const row of result.rows) {
      expect(row.status).toBe('CREATED');
      expect(row.temporaryPassword).toEqual(expect.any(String));
      expect((row.temporaryPassword ?? '').length).toBeGreaterThanOrEqual(12);
    }
    // Two employees must not share a password.
    expect(result.rows[0]?.temporaryPassword).not.toBe(
      result.rows[1]?.temporaryPassword,
    );
  }, 20000);

  it('sends the repository bcrypt hashes and mapped roles, never a plaintext password', async () => {
    const result = await runCsv(twoGoodRows, true);

    const records = repo.createMany.mock.calls[0]?.[1] ?? [];
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(
        result.rows.some((r) => r.temporaryPassword === record.passwordHash),
      ).toBe(false);
      expect(record).not.toHaveProperty('password');
    }
    expect(records.map((r) => r.role)).toEqual(['FINANCE', 'DISPATCHER']);
    expect(records.map((r) => r.email)).toEqual([
      'abebe@shiningstar.et',
      'kebede@shiningstar.et',
    ]);
    expect(records[0]?.phone).toBe('0911234567');
    expect(records[1]?.phone).toBeUndefined();
  }, 20000);

  it('an error row is never written, even on commit', async () => {
    const result = await runCsv(
      'Name,Email,Role\n' +
        'Abebe Kebede,abebe@shiningstar.et,FINANCE\n' +
        'Bad Row,nope,FINANCE\n' +
        'Boss Man,boss@shiningstar.et,CEO\n',
      true,
    );

    expect(result.created).toBe(1);
    const records = repo.createMany.mock.calls[0]?.[1] ?? [];
    expect(records.map((r) => r.email)).toEqual(['abebe@shiningstar.et']);
    expect(result.rows.filter((r) => r.status === 'ERROR')).toHaveLength(2);
  }, 20000);

  it('an employee created by someone else mid-import is a skip, not a failure', async () => {
    repo.createMany.mockResolvedValue(new Set(['abebe@shiningstar.et']));

    const result = await runCsv(twoGoodRows, true);

    expect(result.created).toBe(1);
    expect(rowFor(result, 'abebe@shiningstar.et').status).toBe('CREATED');
    expect(rowFor(result, 'kebede@shiningstar.et').status).toBe(
      'SKIPPED_DUPLICATE',
    );
    expect(rowFor(result, 'kebede@shiningstar.et').temporaryPassword).toBeUndefined();
  }, 20000);
});

describe('bad uploads', () => {
  it('rejects an empty file', async () => {
    await expect(runCsv('')).rejects.toThrow(/empty/i);
  });

  it('rejects a file with more rows than the cap rather than parsing it', async () => {
    const body =
      'Name,Email,Role\n' +
      Array.from(
        { length: 600 },
        (_unused, i) => `Person ${i},person${i}@shiningstar.et,FINANCE`,
      ).join('\n') +
      '\n';

    await expect(runCsv(body)).rejects.toThrow(/limit is 500/);
  });

  it('turns a corrupt workbook into a 400, not a 500', async () => {
    await expect(
      service.import(
        user,
        { originalname: 'staff.xlsx', buffer: Buffer.from('not a zip file') },
        false,
      ),
    ).rejects.toThrow(/Could not read the file/);
  });
});
