import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Difficulty,
  QuestionReportStatus,
  QuestionStatus,
} from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
} from "../../application/question-admin.service";
import { PageQueryDto } from "./questions.dto";

const SLUG = /^[a-z0-9]+(?:-{1,2}[a-z0-9]+)*$/;

const toUpper = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.toUpperCase() : value;

/** Empty strings from a form mean "no value". */
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

// --- Questions ---------------------------------------------------------------

export class AdminQuestionListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: "Exam slug" })
  @IsOptional()
  @IsString()
  examId?: string;

  @ApiPropertyOptional({ description: "Subject slug" })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: "Topic slug" })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiPropertyOptional({ enum: QuestionStatus })
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @ApiPropertyOptional({ description: "Text to find in the stem" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: "Only questions with open reports" })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  reported?: boolean;
}

export class AdminOptionDto {
  @ApiPropertyOptional({
    description: "Existing option id; omit for a new option",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  imageUrl?: string | null;

  @ApiProperty() @IsBoolean() isCorrect!: boolean;
}

export class CreateQuestionDto {
  @ApiPropertyOptional({ description: "Generated when omitted" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  externalKey?: string;

  @ApiProperty({ description: "Exam slug" }) @Matches(SLUG) examId!: string;
  @ApiProperty({ description: "Subject slug" })
  @Matches(SLUG)
  subjectId!: string;

  @ApiPropertyOptional({ description: "Topic slug" })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(SLUG)
  topicId?: string | null;

  @ApiProperty() @IsInt() @Min(1950) @Max(2100) year!: number;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10000) stem!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  stemImageUrl?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  explanation!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  explanationImageUrl?: string | null;

  @ApiProperty({ enum: Difficulty })
  @Transform(toUpper)
  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @ApiPropertyOptional({ enum: QuestionStatus, default: QuestionStatus.DRAFT })
  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @ApiProperty({ type: [AdminOptionDto] })
  @IsArray()
  @ArrayMinSize(MIN_OPTIONS)
  @ArrayMaxSize(MAX_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => AdminOptionDto)
  options!: AdminOptionDto[];
}

export class UpdateQuestionDto {
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) examId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) subjectId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(SLUG)
  topicId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  stem?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  stemImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  explanation?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  explanationImageUrl?: string | null;

  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ type: [AdminOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_OPTIONS)
  @ArrayMaxSize(MAX_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => AdminOptionDto)
  options?: AdminOptionDto[];
}

// --- Taxonomy ----------------------------------------------------------------

export class CreateExamDto {
  @ApiProperty() @Matches(SLUG) @MaxLength(60) slug!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateSubjectDto {
  @ApiProperty() @Matches(SLUG) @MaxLength(80) slug!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ example: "clinical" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  group!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  group?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateTopicDto {
  @ApiProperty({ description: "Conventionally `${subjectSlug}--${topic}`" })
  @Matches(SLUG)
  @MaxLength(160)
  slug!: string;

  @ApiProperty() @Matches(SLUG) subjectId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) name!: string;
}

export class UpdateTopicDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) name!: string;
}

export class ReorderDto {
  @ApiProperty({ description: "Slugs in their new order" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  slugs!: string[];
}

// --- Reports -----------------------------------------------------------------

export class AdminReportListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: QuestionReportStatus })
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(QuestionReportStatus)
  status?: QuestionReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  questionId?: string;
}

export const REPORT_OUTCOMES = [
  QuestionReportStatus.RESOLVED,
  QuestionReportStatus.DISMISSED,
];

export class ResolveReportDto {
  @ApiProperty({ enum: REPORT_OUTCOMES })
  @Transform(toUpper)
  @IsIn(REPORT_OUTCOMES)
  status!: "RESOLVED" | "DISMISSED";

  @ApiPropertyOptional({ description: "Admin note (logged)" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
