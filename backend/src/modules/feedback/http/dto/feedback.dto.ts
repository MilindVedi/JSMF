import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackEmailMode, FeedbackFormStatus, FeedbackQuestionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LONG_TEXT_MAX, MAX_OPTIONS, MAX_QUESTIONS } from '../../domain/feedback-rules';

// --- admin ----------------------------------------------------------------------

export class CreateFeedbackFormDto {
  @ApiPropertyOptional({ example: 'Day 1 feedback', maxLength: 150, description: 'Defaults to "Day N feedback".' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ nullable: true, description: 'The day it asks about. Omit for the session as a whole.' })
  @IsOptional()
  @IsUUID()
  dayId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Another form on this session to copy questions and settings from. Omit for the standard questions.",
  })
  @IsOptional()
  @IsUUID()
  copyFromFormId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'A ready-made template (GET /admin/feedback/templates). Ignored when copying. Omit for the standard one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  templateKey?: string | null;
}

export class UpdateFeedbackFormDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000, description: 'Shown above the questions. Blank removes it.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intro?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500, description: 'Shown after a reply is saved. Blank uses the built-in one.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thankYouText?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  dayId?: string | null;

  @ApiPropertyOptional({ enum: FeedbackFormStatus, description: 'OPEN takes replies (and, in AUTO mode, starts the emails).' })
  @IsOptional()
  @IsEnum(FeedbackFormStatus)
  status?: FeedbackFormStatus;

  @ApiPropertyOptional({ enum: FeedbackEmailMode })
  @IsOptional()
  @IsEnum(FeedbackEmailMode)
  emailMode?: FeedbackEmailMode;

  @ApiPropertyOptional({ minimum: 0, maximum: 10080, description: 'Minutes after the day ends that the automatic email goes out.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  emailDelayMinutes?: number;

  @ApiPropertyOptional({ description: 'Offer students a "hide my name from the team" choice.' })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'Ask "Can we show this on our website?". Off: the team decides.' })
  @IsOptional()
  @IsBoolean()
  askConsentToPublish?: boolean;

  @ApiPropertyOptional({ description: 'Ask whether their first name may appear with their reply on the website.' })
  @IsOptional()
  @IsBoolean()
  askShowName?: boolean;

  @ApiPropertyOptional({
    description: 'The shared (Telegram) link takes replies without signing in, with a typed name. Not verified.',
  })
  @IsOptional()
  @IsBoolean()
  openLink?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Stop taking replies after this time (ISO 8601). Null = never on its own.' })
  @IsOptional()
  @IsDateString()
  closesAt?: string | null;
}

export class FeedbackQuestionDto {
  @ApiPropertyOptional({ description: 'Present for a question already on the form.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ enum: FeedbackQuestionKind })
  @IsEnum(FeedbackQuestionKind)
  kind!: FeedbackQuestionKind;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  label!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'The choices, for the two choice kinds.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS + 5)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];
}

export class ReplaceFeedbackQuestionsDto {
  @ApiProperty({ type: [FeedbackQuestionDto], description: 'The whole list, in order. Missing questions are removed.' })
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => FeedbackQuestionDto)
  questions!: FeedbackQuestionDto[];
}

export class SendFeedbackInvitesDto {
  @ApiPropertyOptional({ type: [String], description: 'Exactly these people. Omit for everyone it applies to.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Without userIds: also remind people already emailed who have not replied. People who replied are never emailed.',
  })
  @IsOptional()
  @IsBoolean()
  includeAlreadyEmailed?: boolean;
}

export class CreateFeedbackHighlightDto {
  @ApiProperty()
  @IsUUID()
  responseId!: string;

  @ApiProperty({ description: "One of this session's feedback sections." })
  @IsUUID()
  sectionId!: string;

  @ApiPropertyOptional({ maxLength: 1000, description: "Defaults to the reply's longest written answer." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  quote?: string;

  @ApiPropertyOptional({ maxLength: 120, description: 'Defaults to "First name · Stage". Ignored for an anonymous reply.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  attribution?: string;

  @ApiPropertyOptional({ description: "Show the student's first name. Defaults to their own answer. Never for anonymous replies." })
  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 5, description: "Defaults to the reply's star rating." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;
}

export class UpdateFeedbackHighlightDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  quote?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  attribution?: string;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;
}

// --- public -----------------------------------------------------------------------

export class FeedbackAnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'RATING (1-5) and SCALE (0-10).' })
  @IsOptional()
  @IsInt()
  rating?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'SHORT_TEXT and LONG_TEXT.' })
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX + 100)
  text?: string | null;

  @ApiPropertyOptional({ type: [String], nullable: true, description: 'SINGLE_CHOICE and MULTI_CHOICE.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS + 5)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  choices?: string[] | null;
}

export class SubmitFeedbackDto {
  @ApiPropertyOptional({ description: "The personal link's token (the `k` in the email link)." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @ApiProperty({ type: [FeedbackAnswerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS + 5)
  @ValidateNested({ each: true })
  @Type(() => FeedbackAnswerDto)
  answers!: FeedbackAnswerDto[];

  @ApiPropertyOptional({ description: 'Hide my name from the team. Only honoured if the form offers it.' })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'You may show this on the website. Only honoured if the form asks.' })
  @IsOptional()
  @IsBoolean()
  consentToPublish?: boolean;

  @ApiPropertyOptional({ description: 'Show my first name with it on the website. Only honoured if the form asks.' })
  @IsOptional()
  @IsBoolean()
  showName?: boolean;
}

/** A reply on the no-sign-in link: everything above, plus who they say they are. */
export class SubmitOpenFeedbackDto extends SubmitFeedbackDto {
  @ApiProperty({ maxLength: 80, description: 'The name the person typed.' })
  @IsString()
  @MaxLength(80)
  respondentName!: string;

  @ApiProperty({
    minLength: 32,
    maxLength: 128,
    description: "A random key the browser keeps, so the same browser changes its reply instead of sending another.",
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32,128}$/)
  editKey!: string;
}
