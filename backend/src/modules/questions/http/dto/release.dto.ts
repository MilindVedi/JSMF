import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RELEASE_NAME, SHA256_HEX } from '../../application/question-release';
import { ImportExamDto, ImportQuestionDto, ImportSubjectDto, ImportTopicDto, SLUG } from './questions.dto';

/**
 * Bounds on one request. The admin page sends a release in chunks under the
 * API's 100 KB body limit (by size, not count); these only stop a request far
 * outside what the page sends.
 */
export const RELEASE_APPLY_MAX_QUESTIONS = 50;
export const RELEASE_PREVIEW_MAX_QUESTIONS = 200;

/** A question's uploaded images by content (SHA-256 hex), or null for none. */
export class ReleaseImagesDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(SHA256_HEX) stem?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(SHA256_HEX) explanation?: string | null;
}

/** A question as a release carries it. Any `status` is ignored: status never travels. */
export class ReleaseQuestionDto extends ImportQuestionDto {
  @ApiProperty({ type: ReleaseImagesDto }) @ValidateNested() @Type(() => ReleaseImagesDto) images!: ReleaseImagesDto;
  @ApiProperty({ description: 'The exporter’s hash of the content; re-derived and checked by the server' })
  @Matches(SHA256_HEX)
  contentHash!: string;
}

export class ReleaseApplyDto {
  @ApiProperty({ description: 'The release’s name, for the audit log' }) @Matches(RELEASE_NAME) name!: string;

  @ApiPropertyOptional({ type: [ImportExamDto], description: 'The exams this chunk uses; created when missing, never changed' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RELEASE_APPLY_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ImportExamDto)
  exams?: ImportExamDto[];

  @ApiPropertyOptional({ type: [ImportSubjectDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RELEASE_APPLY_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ImportSubjectDto)
  subjects?: ImportSubjectDto[];

  @ApiPropertyOptional({ type: [ImportTopicDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RELEASE_APPLY_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ImportTopicDto)
  topics?: ImportTopicDto[];

  @ApiProperty({ type: [ReleaseQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RELEASE_APPLY_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ReleaseQuestionDto)
  questions!: ReleaseQuestionDto[];

  @ApiPropertyOptional({ type: [String], description: 'Keys of conflicting questions to overwrite anyway' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RELEASE_APPLY_MAX_QUESTIONS)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  overwrite?: string[];
}

export class ReleasePreviewQuestionDto {
  @ApiProperty() @IsString() @MaxLength(160) externalKey!: string;
  @ApiProperty() @Matches(SHA256_HEX) contentHash!: string;
  @ApiProperty({ type: ReleaseImagesDto }) @ValidateNested() @Type(() => ReleaseImagesDto) images!: ReleaseImagesDto;
}

export class ReleasePreviewTopicDto {
  @ApiProperty() @Matches(SLUG) slug!: string;
  @ApiProperty() @Matches(SLUG) subjectSlug!: string;
}

export class ReleasePreviewDto {
  @ApiProperty() @Matches(RELEASE_NAME) name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(RELEASE_PREVIEW_MAX_QUESTIONS)
  @Matches(SLUG, { each: true })
  exams!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(RELEASE_PREVIEW_MAX_QUESTIONS)
  @Matches(SLUG, { each: true })
  subjects!: string[];

  @ApiProperty({ type: [ReleasePreviewTopicDto] })
  @IsArray()
  @ArrayMaxSize(RELEASE_PREVIEW_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ReleasePreviewTopicDto)
  topics!: ReleasePreviewTopicDto[];

  @ApiProperty({ type: [ReleasePreviewQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RELEASE_PREVIEW_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => ReleasePreviewQuestionDto)
  questions!: ReleasePreviewQuestionDto[];
}
