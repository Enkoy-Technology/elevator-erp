import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * `section_key` is the slot the document layout renders into, not free text —
 * the renderer looks a section up by this key, so it has to stay an
 * identifier a template can reference.
 */
const SECTION_KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Bodies are plain text. A line beginning with '- ' is a bullet; everything
 * else is a paragraph line. Deliberately not Markdown/HTML: the only
 * structure their eight sections actually use is "prose plus a bullet list"
 * (page 3's Standards block), and a text column the PDF renderer splits on
 * '\n' needs no sanitiser on the way out.
 */
const MAX_BODY_LENGTH = 8000;

export class CreateBoilerplateSectionDto {
  @ApiProperty({ example: 'standards' })
  @IsString()
  @MaxLength(64)
  @Matches(SECTION_KEY_RE, {
    message:
      'sectionKey must be a lowercase identifier (letters, digits, underscore), starting with a letter',
  })
  sectionKey!: string;

  @ApiPropertyOptional({ example: 'Standards' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "Plain text; a line starting with '- ' renders as a bullet." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY_LENGTH)
  body?: string;

  @ApiPropertyOptional({ description: 'Print order. Omitted appends to the end.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * No `sectionKey` and no `isActive`: the key is the slot identity a rendered
 * document references (renaming it silently empties that slot), and
 * deactivation has its own route so there is exactly one way to do it.
 */
export class UpdateBoilerplateSectionDto {
  @ApiPropertyOptional({ example: 'Standards' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY_LENGTH)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateComponentSpecificationDto {
  @ApiProperty({ example: 'Traction machine (gearless motor)' })
  @IsString()
  @MaxLength(200)
  componentName!: string;

  @ApiPropertyOptional({ example: 'FUJI' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional({ example: 'Zhejiang (Sino-Japan Joint Venture)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;

  @ApiPropertyOptional({ description: 'Row number in the printed table. Omitted appends to the end.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;
}

export class UpdateComponentSpecificationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  componentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}

/**
 * The COMPLETE set of ids for the list, in the order they should print.
 * Complete rather than a subset on purpose: `component_specifications` has a
 * UNIQUE (tenant_id, sequence), so a partial reorder either collides with a
 * row that was left out or silently duplicates its number.
 */
export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Every id in the list, in the new print order.' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];
}
