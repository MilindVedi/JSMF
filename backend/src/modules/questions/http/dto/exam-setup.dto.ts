import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MARK,
  MAX_MARK_DENOMINATOR,
  MAX_PATTERN_QUESTIONS,
  MAX_PATTERN_SECTIONS,
  MAX_SECTION_MINUTES,
  MAX_SECTION_NAME,
} from '../../domain/exam-pattern';
import { IN_APP_PATH } from '../../domain/in-app-path';

const SLUG = /^[a-z0-9]+(?:-{1,2}[a-z0-9]+)*$/;

// --- Student ------------------------------------------------------------------

export class StartMockDto {
  @ApiProperty({ description: 'Exam slug, e.g. neet-pg' })
  @Matches(SLUG)
  examId!: string;

  @ApiPropertyOptional({ description: 'In-app path "Save & exit" returns to' })
  @IsOptional()
  @IsString()
  @Matches(IN_APP_PATH)
  sourceHref?: string;
}

// --- Admin --------------------------------------------------------------------

export class UpdatePracticeSettingsDto {
  @ApiPropertyOptional({ description: 'New sessions show options in a shuffled order (stable within a session).' })
  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;
}

export class FractionDto {
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_MARK * MAX_MARK_DENOMINATOR) num!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(MAX_MARK_DENOMINATOR) den!: number;
}

export class MarkingDto {
  @ApiProperty({ type: FractionDto, description: 'Marks for a right answer' })
  @ValidateNested()
  @Type(() => FractionDto)
  correct!: FractionDto;

  @ApiProperty({ type: FractionDto, description: 'Marks taken off for a wrong answer (0 for none)' })
  @ValidateNested()
  @Type(() => FractionDto)
  incorrect!: FractionDto;
}

export class PatternSectionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(MAX_SECTION_NAME) name!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(MAX_PATTERN_QUESTIONS) questions!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(MAX_SECTION_MINUTES) minutes!: number;
}

export class ExamPatternDto {
  @ApiProperty({ type: [PatternSectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PATTERN_SECTIONS)
  @ValidateNested({ each: true })
  @Type(() => PatternSectionDto)
  sections!: PatternSectionDto[];

  @ApiProperty({ description: 'Each section opens when the previous closes, and closes for good with its own time' })
  @IsBoolean()
  sectionsLocked!: boolean;

  @ApiProperty({ type: MarkingDto })
  @ValidateNested()
  @Type(() => MarkingDto)
  marking!: MarkingDto;
}

export class SaveExamPatternDto {
  @ApiProperty({ description: 'Offer this exam as a full mock (once the bank can fill it)' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: ExamPatternDto })
  @ValidateNested()
  @Type(() => ExamPatternDto)
  pattern!: ExamPatternDto;
}
