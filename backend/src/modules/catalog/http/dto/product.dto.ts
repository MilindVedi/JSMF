import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AccessType, AssetKind, LinkKind, ProductStatus, ProductType } from '@prisma/client';

/** Query strings arrive as text; `?flag` and `?flag=true` both mean true. */
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === '' || value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

const toStringArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : value;

/**
 * Money is a decimal string of minor units, never a JSON number: `Number`
 * silently loses precision above 2^53, and amounts leave this API as strings
 * for the same reason.
 */
const MONEY = { pattern: '^\\d+$', example: '19900', description: 'Paise, as a string' };

export class CreateProductDto {
  @ApiPropertyOptional({ enum: ProductType, default: ProductType.PDF })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Derived from the title when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AccessType })
  @IsEnum(AccessType)
  accessType!: AccessType;

  @ApiPropertyOptional(MONEY)
  @IsOptional()
  @Matches(/^\d+$/, { message: 'priceAmountMinor must be a whole number of paise, as a string' })
  priceAmountMinor?: string;

  @ApiPropertyOptional({ ...MONEY, description: 'Strike-through price; must exceed the real price.' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'compareAtAmountMinor must be a whole number of paise, as a string' })
  compareAtAmountMinor?: string | null;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ description: 'The educator this is credited to.' })
  @IsOptional()
  @IsUUID()
  authorUserId?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AdminProductQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ description: 'Case-insensitive title search.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}

export class PublicProductQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: AccessType })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional({
    description:
      'Comma-separated taxonomy term slugs, ANDed — e.g. `anatomy,neet-pg`. Works for any ' +
      'taxonomy, including ones added after this API shipped.',
    example: 'anatomy,neet-pg',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  terms?: string[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UploadAssetDto {
  @ApiProperty({ enum: AssetKind })
  @IsEnum(AssetKind)
  kind!: AssetKind;

  @ApiPropertyOptional({ description: 'Page count, when the admin knows it.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageCount?: number;
}

export class ProductLinkDto {
  @ApiProperty({ enum: LinkKind })
  @IsEnum(LinkKind)
  kind!: LinkKind;

  @ApiProperty({ example: 'https://youtube.com/watch?v=...' })
  @IsString()
  @Matches(/^https:\/\/\S+$/, { message: 'A link must be an https:// URL' })
  @MaxLength(2000)
  url!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
