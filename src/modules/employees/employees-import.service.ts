import { BadRequestException, Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomBytes } from 'node:crypto';

import { BCRYPT_ROUNDS } from '../../common/security.constants';
import { readSpreadsheet, type SheetRow } from '../../common/spreadsheet';
import { USER_ROLES, type AuthenticatedUser, type UserRole } from '../../types/auth.types';
import { CreateEmployeeDto } from './dto/employee.dto';
import type {
  ImportEmployeeRowDto,
  ImportEmployeesResultDto,
} from './dto/import-employees.dto';
import { EmployeesRepository } from './employees.repository';

/**
 * Roles an import may grant. CEO, GENERAL_MANAGER and ADMIN run the company,
 * so granting any of them from a spreadsheet is a privilege-escalation path —
 * an attacker who can get one row into the client's staff file would own the
 * tenant. All three stay a deliberate, one-at-a-time action through
 * POST /v1/employees. CUSTOMER is not an employee at all.
 *
 * This list is derived by SUBTRACTION from USER_ROLES, which means a new role
 * is importable by default. GENERAL_MANAGER was added and silently became
 * grantable by spreadsheet before anyone noticed; the test below now names
 * every excluded role so the next one cannot slip through the same way.
 */
const NOT_IMPORTABLE: readonly UserRole[] = [
  'CEO',
  'GENERAL_MANAGER',
  'ADMIN',
  'CUSTOMER',
];

export const IMPORTABLE_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (role) => !NOT_IMPORTABLE.includes(role),
);

/**
 * Header synonyms, keyed by the field they fill. Compared after
 * `normalizeHeader` strips everything but letters and digits, so "E-mail",
 * "e mail" and "EMAIL" all arrive here as `email`. This file comes from the
 * client's own spreadsheet — being fussy about the header text just means the
 * import fails for a reason nobody can act on.
 */
const HEADER_SYNONYMS: Record<'fullName' | 'email' | 'role' | 'phone', readonly string[]> = {
  fullName: ['fullname', 'name', 'employeename', 'staffname', 'fullnames'],
  email: ['email', 'emailaddress', 'mail'],
  role: ['role', 'position', 'jobtitle', 'title', 'designation'],
  phone: [
    'phone',
    'phoneno',
    'phonenumber',
    'mobile',
    'mobileno',
    'mobilenumber',
    'telephone',
    'tel',
    'telno',
    'contact',
    'contactnumber',
  ],
};

const normalizeHeader = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "sales manager", "Sales-Manager", " SALES  MANAGER " all map to SALES_MANAGER. */
export const normalizeRole = (raw: string): UserRole | null => {
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return IMPORTABLE_ROLES.find((role) => role === key) ?? null;
};

/** URL-safe, ~16 chars of real entropy. Never read from the sheet; never logged. */
const generatePassword = (): string => randomBytes(12).toString('base64url');

type ColumnIndex = Partial<Record<keyof typeof HEADER_SYNONYMS, number>>;

/** Maps the header row to column positions, ignoring any column we don't know. */
export const mapHeaders = (headerCells: string[]): ColumnIndex => {
  const index: ColumnIndex = {};
  headerCells.forEach((cell, position) => {
    const normalized = normalizeHeader(cell);
    if (normalized === '') {
      return;
    }
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      const key = field as keyof typeof HEADER_SYNONYMS;
      if (index[key] === undefined && synonyms.includes(normalized)) {
        index[key] = position;
      }
    }
  });
  return index;
};

const isBlankRow = (row: SheetRow): boolean =>
  row.cells.every((cell) => cell.trim() === '');

/** Flattens class-validator output into one sentence an admin can act on. */
const describeValidationErrors = (
  errors: ReturnType<typeof validateSync>,
): string =>
  errors
    .map((error) =>
      Object.values(error.constraints ?? {}).join('; ') ||
      `${error.property} is invalid`,
    )
    .join('; ');

type Candidate = {
  row: ImportEmployeeRowDto;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  password: string;
};

@Injectable()
export class EmployeesImportService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  /**
   * Validate-and-report by default; `commit` must be explicitly true to write.
   * A half-applied staff import is worse than a rejected one, so the write is
   * a single transaction in the repository: it all lands or none of it does.
   */
  async import(
    user: AuthenticatedUser,
    file: { originalname: string; buffer: Buffer },
    commit: boolean,
  ): Promise<ImportEmployeesResultDto> {
    const sheetRows = await this.readRows(file);
    const headerRow = sheetRows.find((row) => !isBlankRow(row));
    if (!headerRow) {
      throw new BadRequestException('The file is empty.');
    }

    const columns = mapHeaders(headerRow.cells);
    const missing = (['fullName', 'email', 'role'] as const).filter(
      (field) => columns[field] === undefined,
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `The sheet is missing a column for: ${missing.join(', ')}. ` +
          `Found headers: ${headerRow.cells.filter((c) => c.trim() !== '').join(', ') || '(none)'}. ` +
          'Expected headers like "Full Name", "Email", "Role", "Phone".',
      );
    }

    const rows: ImportEmployeeRowDto[] = [];
    const candidates: Candidate[] = [];
    const seenEmails = new Set<string>();

    for (const sheetRow of sheetRows) {
      // Blank rows are how humans space out a spreadsheet — not an error.
      if (sheetRow.rowNumber <= headerRow.rowNumber || isBlankRow(sheetRow)) {
        continue;
      }
      const candidate = this.buildCandidate(sheetRow, columns, seenEmails);
      rows.push(candidate.row);
      if (candidate.candidate) {
        candidates.push(candidate.candidate);
        seenEmails.add(candidate.candidate.email);
      }
    }

    const existing = await this.employeesRepository.findExistingEmails(
      user.tenantId,
      candidates.map((c) => c.email),
    );
    const fresh: Candidate[] = [];
    for (const candidate of candidates) {
      if (existing.has(candidate.email)) {
        candidate.row.status = 'SKIPPED_DUPLICATE';
        candidate.row.message = `${candidate.email} is already an employee — left unchanged.`;
      } else {
        fresh.push(candidate);
      }
    }

    if (!commit) {
      return { dryRun: true, totalRows: rows.length, created: 0, rows };
    }

    // Hashed before the transaction opens: bcrypt at cost 12 is deliberately
    // slow, and holding a write transaction open for that long would block
    // every other write to `users` for the whole import.
    const records = await Promise.all(
      fresh.map(async (candidate) => ({
        email: candidate.email,
        fullName: candidate.fullName,
        phone: candidate.phone,
        role: candidate.role,
        passwordHash: await hash(candidate.password, BCRYPT_ROUNDS),
      })),
    );
    const createdEmails = await this.employeesRepository.createMany(
      user.tenantId,
      records,
    );

    for (const candidate of fresh) {
      if (createdEmails.has(candidate.email)) {
        candidate.row.status = 'CREATED';
        // Returned once, right here. Not stored in plaintext, not logged.
        candidate.row.temporaryPassword = candidate.password;
      } else {
        // Someone created this employee between our check and the insert.
        candidate.row.status = 'SKIPPED_DUPLICATE';
        candidate.row.message = `${candidate.email} is already an employee — left unchanged.`;
      }
    }

    return {
      dryRun: false,
      totalRows: rows.length,
      created: createdEmails.size,
      rows,
    };
  }

  /**
   * The one try/catch in this module, and it earns it: the buffer is untrusted
   * input, and a corrupt workbook throwing out of ExcelJS is a bad upload
   * (400), not a server fault (500).
   */
  private async readRows(file: {
    originalname: string;
    buffer: Buffer;
  }): Promise<SheetRow[]> {
    try {
      return await readSpreadsheet(file.buffer, file.originalname);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        'Could not read the file. Save it as .xlsx or .csv and try again.',
      );
    }
  }

  private buildCandidate(
    sheetRow: SheetRow,
    columns: ColumnIndex,
    seenEmails: ReadonlySet<string>,
  ): { row: ImportEmployeeRowDto; candidate?: Candidate } {
    const cell = (field: keyof typeof HEADER_SYNONYMS): string => {
      const position = columns[field];
      return position === undefined ? '' : (sheetRow.cells[position] ?? '').trim();
    };

    const fullName = cell('fullName');
    const rawEmail = cell('email');
    const rawRole = cell('role');
    const phone = cell('phone');
    const email = rawEmail.toLowerCase();

    const row: ImportEmployeeRowDto = {
      rowNumber: sheetRow.rowNumber,
      fullName: fullName || null,
      email: rawEmail || null,
      role: rawRole || null,
      status: 'READY',
    };
    const reject = (message: string): { row: ImportEmployeeRowDto } => {
      row.status = 'ERROR';
      row.message = message;
      return { row };
    };

    const role = normalizeRole(rawRole);
    if (!role) {
      return reject(
        rawRole === ''
          ? `Role is required. Valid roles: ${IMPORTABLE_ROLES.join(', ')}.`
          : `Role "${rawRole}" is not a role this import can grant. Valid roles: ${IMPORTABLE_ROLES.join(', ')}. ` +
              'CEO and ADMIN must be added one at a time, not from a spreadsheet.',
      );
    }

    const password = generatePassword();
    // Reuses CreateEmployeeDto's rules verbatim — email shape, name length, and
    // the Ethiopian phone validator — rather than re-deriving them here, so the
    // import can never accept something the create endpoint would reject.
    const dto = plainToInstance(CreateEmployeeDto, {
      email,
      fullName,
      role,
      password,
      ...(phone === '' ? {} : { phone }),
    });
    const errors = validateSync(dto, { whitelist: true });
    if (errors.length > 0) {
      return reject(describeValidationErrors(errors));
    }

    if (seenEmails.has(email)) {
      // Duplicated inside the file itself: the sheet is wrong and a person has
      // to decide which row is right. (A duplicate against the database is a
      // re-run of the same file and is skipped, not an error.)
      return reject(`${email} appears more than once in this file.`);
    }

    return {
      row,
      candidate: {
        row,
        email,
        fullName,
        ...(phone === '' ? {} : { phone }),
        role,
        password,
      },
    };
  }
}
