import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTaxonomyDto {
  @ApiProperty({
    example: 'difficulty',
    description: 'Stable identifier used in filter links. Cannot be changed later.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @ApiProperty({ example: 'Difficulty' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false, description: 'Whether terms may nest, e.g. topics under subjects.' })
  @IsOptional()
  @IsBoolean()
  isHierarchical?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Whether a product may carry several of these.' })
  @IsOptional()
  @IsBoolean()
  isMultiSelect?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Field order in the admin form and filter list.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** `key` is omitted: renaming it would break saved filter links. */
export class UpdateTaxonomyDto extends PartialType(OmitType(CreateTaxonomyDto, ['key'] as const)) {}

export class CreateTermDto {
  @ApiProperty({ example: 'Pathology' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'Derived from the name when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'May point at a term in another taxonomy — that is how Subject → Topic works.' })
  @IsOptional()
  @IsUUID()
  parentTermId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateTermDto extends PartialType(CreateTermDto) {}

export class SetProductTermsDto {
  @ApiProperty({
    type: [String],
    description: 'The complete set of terms for this product; anything omitted is removed.',
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  termIds!: string[];
}
