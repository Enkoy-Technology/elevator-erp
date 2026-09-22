import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { readSpreadsheet, type SheetRow } from '../../common/spreadsheet';
import { NotificationsRepository } from '../notifications/notifications.repository';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateSiteSurveyDto } from './dto/site-survey.dto';
import type {
  ImportSiteSurveyErrorDto,
  ImportSiteSurveyRowDto,
  ImportSiteSurveysResultDto,
} from './dto/import-site-surveys.dto';
import { SiteSurveysRepository } from './site-surveys.repository';

type Field = keyof CreateSiteSurveyDto;

/**
 * Who collected the sheet, from the line the client writes by hand directly
 * above the header row. A sheet nobody has filled in still carries the blank
 * template's own label there ("SITE COLLECTION FORM / DATE :"), so the label
 * and any date beside it are stripped; whatever readable name is left is the
 * collector, and an untouched template leaves nothing and reads as null.
 */
const readCollector = (row: { cells: string[] } | undefined): string | null => {
  if (!row) {
    return null;
  }
  const text = row.cells
    .map((cell) => cell.trim())
    .filter(Boolean)
    // The client merges this line across the sheet (D3:P3), and ExcelJS hands
    // back the value once per merged column — join the distinct cells or the
    // name comes out repeated a dozen times.
    .filter((cell, index, cells) => cells.indexOf(cell) === index)
    .join(' ')
    .replace(/site\s*collection\s*form/gi, '')
    .replace(/date\s*[:.-]?\s*/gi, '')
    .replace(/[\d/.-]+/g, '')
    .replace(/[/|,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A stray separator or a lone initial is noise, not a name.
  return /\p{L}{2,}/u.test(text) ? text.slice(0, 200) : null;
};

/**
 * Header synonyms, keyed by the field they fill, compared after
 * `normalizeHeader` has stripped everything but letters and digits. The
 * client's own SITE COLLECTION FORM writes the shaft columns as a merged
 * "SHAFT DATA" over "width"/"depth", so the combined labels are in here too.
 */
const HEADER_SYNONYMS: Record<
  Exclude<Field, 'surveyDate'>,
  readonly string[]
> = {
  projectName: ['projectname'],
  address: ['address'],
  contactName: ['contactpersonname', 'contactname', 'contactperson'],
  contactPhone: [
    'contactpersontelephone',
    'contactpersonphone',
    'telephone',
    'phone',
    'tel',
  ],
  shaftWidthCm: ['shaftdatawidth', 'shaftwidth', 'width'],
  shaftDepthCm: ['shaftdatadepth', 'shaftdepth', 'depth'],
  floors: ['floors', 'floor'],
  overheadCm: ['oh', 'overhead'],
  machineRoom: ['machineroom', 'machineroomtype', 'mr'],
  units: ['units', 'unit', 'noofunits', 'quantity'],
};

const NUMBER_FIELDS = [
  'shaftWidthCm',
  'shaftDepthCm',
  'overheadCm',
  'units',
] as const;

type MappedField = keyof typeof HEADER_SYNONYMS;

const FIELDS = Object.keys(HEADER_SYNONYMS) as MappedField[];

const normalizeHeader = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9]/g, '');

/** `shaftWidthCm` -> "shaft width cm", so an error names the sheet's column. */
const humanLabel = (field: string): string =>
  field.replace(/([A-Z])/g, ' $1').toLowerCase();

const isBlank = (cell: string | undefined): boolean =>
  (cell ?? '').trim() === '';

const cellAt = (row: SheetRow, position: number | undefined): string =>
  position === undefined ? '' : (row.cells[position] ?? '').trim();

type ColumnIndex = Partial<Record<MappedField, number>>;

/**
 * The sheet's header is two rows: merged group cells ("CONTACT PERSON",
 * "SHAFT DATA") over sub headers ("name"/"telephone", "width"/"depth"). A
 * column's real label is therefore its group plus its own sub header —
 * "CONTACT PERSON" + "telephone". ExcelJS repeats a merged value across the
 * merged range, but a CSV of the same sheet leaves the continuation cells
 * blank, so the group is taken as the nearest non-empty header cell at or to
 * the left. Where the two rows say the same thing ("PROJECT NAME" over
 * "PROJECT NAME") the label is not doubled.
 */
export const mapHeaders = (
  headerCells: string[],
  subCells: string[],
): { columns: ColumnIndex; usedSubRow: boolean } => {
  const columns: ColumnIndex = {};
  let usedSubRow = false;
  const width = Math.max(headerCells.length, subCells.length);
  let group = '';

  for (let position = 0; position < width; position += 1) {
    const own = normalizeHeader(headerCells[position] ?? '');
    if (own !== '') {
      group = own;
    }
    const sub = normalizeHeader(subCells[position] ?? '');
    const combined = sub === '' || sub === group ? group : `${group}${sub}`;

    // The combined label first; a file with a single header row (a CSV export
    // of the same sheet) has data in the row below, which matches nothing, and
    // falls back to the group label on its own.
    const field =
      FIELDS.find(
        (candidate) =>
          columns[candidate] === undefined &&
          HEADER_SYNONYMS[candidate].includes(combined),
      ) ??
      FIELDS.find(
        (candidate) =>
          columns[candidate] === undefined &&
          HEADER_SYNONYMS[candidate].includes(group),
      );
    if (!field) {
      continue;
    }
    columns[field] = position;
    if (combined !== group && HEADER_SYNONYMS[field].includes(combined)) {
      usedSubRow = true;
    }
  }
  return { columns, usedSubRow };
};

/**
 * "200", "200.0" and "1,850" are all how a person writes a measurement into
 * this sheet; anything else is a mistake the uploader has to see, not a value
 * to guess at. Returns undefined for a blank cell, null for a non-number.
 *
 * Digits only, rather than `Number()`: `Number('1e3')` is 1000 and
 * `Number('0x10')` is 16, so a typo in a shaft column would otherwise become a
 * plausible-looking measurement instead of a reported error.
 */
const PLAIN_NUMBER_RE = /^-?\d+(\.\d+)?$/;

export const parseSheetNumber = (raw: string): number | null | undefined => {
  const text = raw.trim().replace(/,/g, '');
  if (text === '') {
    return undefined;
  }
  return PLAIN_NUMBER_RE.test(text) ? Number(text) : null;
};

/**
 * Flattens class-validator output into one sentence a salesperson can act on.
 * class-validator names the DTO property — "shaftWidthCm must not be greater
 * than 2000" — which is not a column anyone can find on the sheet, and the
 * phone constraint names nothing at all. Both get the human column label.
 */
const describeValidationErrors = (
  errors: ReturnType<typeof validateSync>,
): string =>
  errors
    .map((error) => {
      const label = humanLabel(error.property);
      const text =
        Object.values(error.constraints ?? {}).join('; ') || 'is invalid';
      return text.includes(error.property)
        ? text.split(error.property).join(label)
        : `${label} ${text}`;
    })
    .join('; ');

@Injectable()
export class SiteSurveysImportService {
  private readonly logger = new Logger(SiteSurveysImportService.name);

  constructor(
    private readonly surveysRepository: SiteSurveysRepository,
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  /**
   * Validate-and-report by default; `commit` must be explicitly true to write.
   * Every row is attributed to the uploading user and dated today, exactly as
   * a typed submission is, but the COLLECTOR is read off the sheet: the
   * client writes the names by hand just above the header ("Betelhem tesfa
   * and nafyad"), and they are often two people who have no account here.
   */
  async import(
    user: AuthenticatedUser,
    file: { originalname: string; buffer: Buffer },
    commit: boolean,
  ): Promise<ImportSiteSurveysResultDto> {
    const sheetRows = await this.readRows(file);
    const headerIndex = sheetRows.findIndex((row) =>
      row.cells.some((cell) => normalizeHeader(cell) === 'projectname'),
    );
    const headerRow = sheetRows[headerIndex];
    if (!headerRow) {
      throw new BadRequestException(
        'No "PROJECT NAME" column found. Upload the SITE COLLECTION FORM with its header row intact — ' +
          'the columns it expects are PROJECT NAME, ADDRESS, CONTACT PERSON (name, telephone), ' +
          'SHAFT DATA (width, depth), FLOORS, OH, Machine room, UNITS.',
      );
    }

    const collectedByName = readCollector(sheetRows[headerIndex - 1]);
    const subRow = sheetRows[headerIndex + 1];
    const { columns, usedSubRow } = mapHeaders(
      headerRow.cells,
      subRow?.cells ?? [],
    );
    const firstDataRowNumber = usedSubRow
      ? (subRow?.rowNumber ?? headerRow.rowNumber) + 1
      : headerRow.rowNumber + 1;

    const rows: ImportSiteSurveyRowDto[] = [];
    const errors: ImportSiteSurveyErrorDto[] = [];
    const payloads: CreateSiteSurveyDto[] = [];

    for (const sheetRow of sheetRows) {
      if (sheetRow.rowNumber < firstDataRowNumber) {
        continue;
      }
      // A row where every column we understand is empty is spacing, or one of
      // the blank ruled rows the printed form is full of — not an error.
      if (
        FIELDS.every((field) => {
          const position = columns[field];
          return position === undefined || isBlank(sheetRow.cells[position]);
        })
      ) {
        continue;
      }
      // The form repeats "PROJECT NAME" in its sub-header row, and only the
      // columns whose sub-header differs from its group ("telephone" under
      // "CONTACT PERSON") make `usedSubRow` true. The same form minus the
      // CONTACT PERSON and SHAFT DATA groups has no such column, and would
      // otherwise import its own second header row as a survey named
      // "PROJECT NAME".
      if (
        HEADER_SYNONYMS.projectName.includes(
          normalizeHeader(cellAt(sheetRow, columns.projectName)),
        )
      ) {
        continue;
      }
      const parsed = this.parseRow(sheetRow, columns);
      if ('message' in parsed) {
        errors.push({ row: sheetRow.rowNumber, message: parsed.message });
        continue;
      }
      rows.push({ rowNumber: sheetRow.rowNumber, ...toRowDto(parsed.dto) });
      payloads.push(parsed.dto);
    }

    const totalRows = rows.length + errors.length;
    if (!commit) {
      return {
        dryRun: true,
        collectedByName,
        totalRows,
        imported: 0,
        skipped: errors.length,
        errors,
        rows,
      };
    }

    const created = await this.surveysRepository.createMany(
      user.tenantId,
      user.userId,
      payloads,
      collectedByName,
    );
    await this.notifyManagers(user, created, payloads, collectedByName);
    return {
      dryRun: false,
      collectedByName,
      totalRows,
      imported: created,
      skipped: errors.length,
      errors,
      rows,
    };
  }

  /**
   * One notification per upload, never one per row: a sheet of twelve sites
   * is one event to a manager, and twelve pings is the noise that sent them
   * back to Telegram in the first place. Fire-and-log — a manager who cannot
   * be told must not cost the tenant the sheets it just imported.
   */
  private async notifyManagers(
    user: AuthenticatedUser,
    created: number,
    payloads: readonly CreateSiteSurveyDto[],
    collectedByName: string | null,
  ): Promise<void> {
    if (created === 0) {
      return;
    }
    try {
      const managerIds = await this.surveysRepository.listManagerIds(
        user.tenantId,
      );
      const names = payloads
        .slice(0, 3)
        .map((payload) => payload.projectName)
        .join(', ');
      const sites =
        payloads.length > 3
          ? `${names} and ${payloads.length - 3} more`
          : names;
      // The sheet says who collected it; the uploader may be someone else.
      const body = collectedByName
        ? `${sites} — collected by ${collectedByName}`
        : sites;
      for (const userId of managerIds) {
        await this.notificationsRepository.create(user.tenantId, user.userId, {
          userId,
          type: 'GENERAL',
          title: `${created} site survey${created === 1 ? '' : 's'} imported`,
          body,
          linkPath: '/surveys',
        });
      }
    } catch (err) {
      this.logger.error(
        `Imported ${created} site survey(s) but the managers were not notified: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * The one try/catch here, and it earns it: the buffer is untrusted input,
   * and a corrupt workbook thrown out of ExcelJS is a bad upload (400), not a
   * server fault (500).
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

  private parseRow(
    sheetRow: SheetRow,
    columns: ColumnIndex,
  ): { dto: CreateSiteSurveyDto } | { message: string } {
    const cell = (field: MappedField): string =>
      cellAt(sheetRow, columns[field]);

    // Said plainly once, here: class-validator answers a missing project name
    // with three constraint messages, the first of which is about its maximum
    // length.
    if (cell('projectName') === '') {
      return { message: 'PROJECT NAME is required.' };
    }

    const payload: Record<string, unknown> = {};
    for (const field of FIELDS) {
      const text = cell(field);
      if (text === '') {
        continue;
      }
      if ((NUMBER_FIELDS as readonly string[]).includes(field)) {
        const value = parseSheetNumber(text);
        if (value === null) {
          return {
            message: `${humanLabel(field)}: "${text}" is not a number.`,
          };
        }
        payload[field] = value;
      } else {
        payload[field] = text;
      }
    }

    // Reuses CreateSiteSurveyDto's rules verbatim — the phone validator, the
    // measurement bounds, the name lengths — so the import can never write
    // what POST /v1/site-surveys would reject.
    const dto = plainToInstance(CreateSiteSurveyDto, payload);
    const errors = validateSync(dto, { whitelist: true });
    if (errors.length > 0) {
      return { message: describeValidationErrors(errors) };
    }
    return { dto };
  }
}

/** Every column of the sheet, with what the salesperson left blank as null. */
const toRowDto = (
  dto: CreateSiteSurveyDto,
): Omit<ImportSiteSurveyRowDto, 'rowNumber'> => ({
  projectName: dto.projectName,
  address: dto.address ?? null,
  contactName: dto.contactName ?? null,
  contactPhone: dto.contactPhone ?? null,
  shaftWidthCm: dto.shaftWidthCm ?? null,
  shaftDepthCm: dto.shaftDepthCm ?? null,
  floors: dto.floors ?? null,
  overheadCm: dto.overheadCm ?? null,
  machineRoom: dto.machineRoom ?? null,
  units: dto.units ?? null,
});
