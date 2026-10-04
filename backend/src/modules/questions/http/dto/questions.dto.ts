import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Difficulty,
  PracticeMode,
  Prisma,
  QuestionReportReason,
  QuestionStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_SESSION_QUESTIONS } from '../../application/practice.service';

const SLUG = /^[a-z0-9]+(?:-{1,2}[a-z0-9]+)*$/;

/** `a,b` in a query string, or an already-split array, to a trimmed string array. */
const toStringArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : value;

const toIntArray = ({ value }: { value: unknown }): unknown => {
  const parts = toStringArray({ value });
  return Array.isArray(parts) ? parts.map((part) => Number(part)) : parts;
};

/** The web app sends `easy`; the database says `EASY`. Accept both. */
const toUpperArray = ({ value }: { value: unknown }): unknown => {
  const parts = toStringArray({ value });
  return Array.isArray(parts)
    ? parts.map((part) => (typeof part === 'string' ? part.toUpperCase() : part))
    : parts;
};

const toUpper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase().replace(/-/g, '_') : value;

export const USER_QUESTION_STATES = ['unattempted', 'correct', 'incorrect', 'bookmarked'] as const;

export class QuestionFiltersDto {
  @ApiPropertyOptional({
    description: 'Exam slugs, comma-separated',
    example: 'neet-pg,fmge',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  examIds?: string[];

  @ApiPropertyOptional({ description: 'Subject slugs', example: 'anatomy' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({
    description: 'Topic slugs',
    example: 'anatomy--upper-limb',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  topicIds?: string[];

  @ApiPropertyOptional({ example: '2022,2023' })
  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  @IsInt({ each: true })
  years?: number[];

  @ApiPropertyOptional({
    enum: Difficulty,
    isArray: true,
    example: 'easy,hard',
  })
  @IsOptional()
  @Transform(toUpperArray)
  @IsArray()
  @IsEnum(Difficulty, { each: true })
  difficulties?: Difficulty[];

  @ApiPropertyOptional({ enum: USER_QUESTION_STATES })
  @IsOptional()
  @IsIn(USER_QUESTION_STATES)
  status?: (typeof USER_QUESTION_STATES)[number];

  @ApiPropertyOptional({ description: 'Collection ids (my own), comma-separated' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsUUID('all', { each: true })
  collectionIds?: string[];
}

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class ListQuestionsQueryDto extends QuestionFiltersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class StartSessionDto {
  @ApiProperty({ enum: PracticeMode })
  @Transform(toUpper)
  @IsEnum(PracticeMode)
  mode!: PracticeMode;

  @ApiPropertyOptional({ example: 'Anatomy — 20 questions' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({
    description: 'Explicit questions, in order. Overrides filters.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SESSION_QUESTIONS)
  @IsUUID('all', { each: true })
  questionIds?: string[];

  @ApiPropertyOptional({ type: QuestionFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionFiltersDto)
  filters?: QuestionFiltersDto;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_QUESTIONS)
  count?: number;

  @ApiPropertyOptional({ description: 'Seconds; omit for untimed' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(6 * 3600)
  timeLimitSec?: number;

  @ApiPropertyOptional({
    description: 'Opaque client context stored with the session',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class AnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId!: string;

  @ApiProperty()
  @IsUUID()
  selectedOptionId!: string;

  @ApiPropertyOptional({
    description: 'Time spent on this question since last report, ms',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6 * 3600 * 1000)
  timeSpentMs?: number;
}

export class FlagDto {
  @ApiProperty()
  @IsBoolean()
  flagged!: boolean;
}

export class ReportQuestionDto {
  @ApiProperty({
    enum: QuestionReportReason,
    description: 'Also accepts `wrong-answer` style',
  })
  @Transform(toUpper)
  @IsEnum(QuestionReportReason)
  reason!: QuestionReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

// --- Admin -------------------------------------------------------------------

export class SetQuestionStatusDto {
  @ApiProperty({ enum: QuestionStatus })
  @IsEnum(QuestionStatus)
  status!: QuestionStatus;
}

export class ImportExamDto {
  @ApiProperty() @Matches(SLUG) slug!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ImportSubjectDto {
  @ApiProperty() @Matches(SLUG) slug!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) group!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ImportTopicDto {
  @ApiProperty() @Matches(SLUG) slug!: string;
  @ApiProperty() @Matches(SLUG) subjectSlug!: string;
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ImportOptionDto {
  @ApiProperty() @IsString() @MinLength(1) text!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiProperty() @IsBoolean() isCorrect!: boolean;
}

export class ImportQuestionDto {
  @ApiProperty({
    description: 'Stable id from the content pipeline; the upsert key',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  externalKey!: string;

  @ApiProperty() @Matches(SLUG) examSlug!: string;
  @ApiProperty() @Matches(SLUG) subjectSlug!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) topicSlug?: string;

  @ApiProperty() @IsInt() @Min(1950) @Max(2100) year!: number;
  @ApiProperty() @IsString() @MinLength(1) stem!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stemImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() stemFigure?: Prisma.InputJsonObject;
  @ApiProperty() @IsString() @MinLength(1) explanation!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() explanationImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() explanationFigure?: Prisma.InputJsonObject;

  @ApiProperty({ enum: Difficulty })
  @Transform(toUpper)
  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @ApiPropertyOptional({ enum: QuestionStatus })
  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @ApiProperty({ type: [ImportOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ImportOptionDto)
  options!: ImportOptionDto[];
}

export class ImportQuestionsDto {
  @ApiPropertyOptional({ type: [ImportExamDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExamDto)
  exams?: ImportExamDto[];

  @ApiPropertyOptional({ type: [ImportSubjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportSubjectDto)
  subjects?: ImportSubjectDto[];

  @ApiPropertyOptional({ type: [ImportTopicDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTopicDto)
  topics?: ImportTopicDto[];

  @ApiProperty({ type: [ImportQuestionDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionDto)
  questions!: ImportQuestionDto[];
}
