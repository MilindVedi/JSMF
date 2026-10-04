import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MAX_QUESTIONS_PER_COLLECTION } from '../../application/collections.service';

export class CreateCollectionDto {
  @ApiProperty({ example: 'High-yield pharmacology' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Initial questions, in order' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS_PER_COLLECTION)
  @IsUUID('all', { each: true })
  questionIds?: string[];
}

export class UpdateCollectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class ReinforceQueryDto {
  @ApiPropertyOptional({ default: 7, description: 'Window for "recently correct", in India-time days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  recentDays?: number;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'neet-pg', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-{1,2}[a-z0-9]+)*$/)
  @MaxLength(60)
  targetExamId?: string | null;

  @ApiPropertyOptional({ example: 10, description: 'Answers per day that complete the daily goal' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  dailyTarget?: number;
}
