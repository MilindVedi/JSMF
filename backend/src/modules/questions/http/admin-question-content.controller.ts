import { UseInterceptors } from "@nestjs/common";
import { InvalidateTaxonomyInterceptor } from "./invalidate-taxonomy.interceptor";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../identity/application/auth.service";
import { PyqTaxonomyAdminService } from "../application/pyq-taxonomy-admin.service";
import { QuestionAdminService } from "../application/question-admin.service";
import { QUESTION_IMAGE_FIELDS, type QuestionImageField } from "../application/question-image-links";
import { QuestionImageUploads } from "../application/question-image-uploads";
import {
  AdminQuestionListQueryDto,
  AdminReportListQueryDto,
  BulkQuestionStatusDto,
  CreateExamDto,
  CreateQuestionDto,
  CreateSubjectDto,
  CreateTopicDto,
  ReorderDto,
  ResolveReportDto,
  UpdateExamDto,
  UpdateQuestionDto,
  UpdateSubjectDto,
  UpdateTopicDto,
} from "./dto/admin-content.dto";
import { SetQuestionStatusDto } from "./dto/questions.dto";

/** Question editing, taxonomy management and report triage for the PYQ bank. */
@ApiTags("admin: pyq")
@ApiBearerAuth()
@Roles("ADMIN")
@UseInterceptors(InvalidateTaxonomyInterceptor)
@Controller("admin/pyq")
export class AdminQuestionContentController {
  constructor(
    private readonly questions: QuestionAdminService,
    private readonly taxonomy: PyqTaxonomyAdminService,
    private readonly images: QuestionImageUploads,
  ) {}

  // --- Questions ------------------------------------------------------------

  @Get("questions")
  @ApiOperation({
    summary: "Questions with answers and report counts, filterable",
  })
  list(@Query() query: AdminQuestionListQueryDto) {
    const { page, pageSize, ...filters } = query;
    return this.questions.list(filters, page, pageSize);
  }

  // Before `questions/:id`, so "ids" and "status" are never read as an id.
  @Get("questions/ids")
  @ApiOperation({
    summary: "Ids of every question matching the list filters (at most 2000), for bulk actions",
  })
  ids(@Query() query: AdminQuestionListQueryDto) {
    return this.questions.ids(query);
  }

  @Patch("questions/status")
  @ApiOperation({
    summary: "Publish or unpublish many questions at once (exactly these ids)",
  })
  setStatusMany(
    @Body() dto: BulkQuestionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.setStatusMany(dto.ids, dto.status, user.id);
  }

  @Get("questions/:id")
  @ApiOperation({
    summary: "One question with options, answer and explanation",
  })
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.questions.get(id);
  }

  @Post("questions")
  @ApiOperation({
    summary: "Create a question (2–6 options, exactly one correct)",
  })
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.create(dto, user.id);
  }

  @Patch("questions/:id")
  @ApiOperation({ summary: "Edit a question; options are matched by id" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.update(id, dto, user.id);
  }

  @Patch("questions/:id/status")
  @ApiOperation({ summary: "Publish or unpublish a question" })
  setStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetQuestionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.setStatus(id, dto.status, user.id);
  }

  @Delete("questions/:id")
  @HttpCode(204)
  @ApiOperation({
    summary: "Soft-delete; past sessions and reviews keep working",
  })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.remove(id, user.id);
  }

  @Delete("questions/:id/images/:field")
  @ApiOperation({
    summary:
      "Remove a question's uploaded image (`stem` or `explanation`) and delete its file; returns the question",
  })
  async removeImage(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("field") field: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!QUESTION_IMAGE_FIELDS.includes(field as QuestionImageField)) {
      throw new BadRequestException('field must be "stem" or "explanation".');
    }
    await this.images.remove(id, field as QuestionImageField, user.id);
    return this.questions.get(id);
  }

  // --- Taxonomy -------------------------------------------------------------

  @Get("taxonomy")
  @ApiOperation({
    summary: "Exams, subjects, topics with live question counts",
  })
  tree() {
    return this.taxonomy.tree();
  }

  @Post("exams")
  createExam(
    @Body() dto: CreateExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.createExam(dto, user.id);
  }

  @Put("exams/order")
  reorderExams(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.reorder("exams", dto.slugs, user.id);
  }

  @Patch("exams/:slug")
  updateExam(
    @Param("slug") slug: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.updateExam(slug, dto, user.id);
  }

  @Delete("exams/:slug")
  @HttpCode(204)
  @ApiOperation({ summary: "Only when no question references it" })
  deleteExam(
    @Param("slug") slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.deleteExam(slug, user.id);
  }

  @Post("subjects")
  createSubject(
    @Body() dto: CreateSubjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.createSubject(dto, user.id);
  }

  @Put("subjects/order")
  reorderSubjects(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.reorder("subjects", dto.slugs, user.id);
  }

  @Patch("subjects/:slug")
  updateSubject(
    @Param("slug") slug: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.updateSubject(slug, dto, user.id);
  }

  @Delete("subjects/:slug")
  @HttpCode(204)
  deleteSubject(
    @Param("slug") slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.deleteSubject(slug, user.id);
  }

  @Post("topics")
  createTopic(
    @Body() dto: CreateTopicDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.createTopic(dto, user.id);
  }

  @Put("topics/order")
  reorderTopics(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.reorder("topics", dto.slugs, user.id);
  }

  @Patch("topics/:slug")
  updateTopic(
    @Param("slug") slug: string,
    @Body() dto: UpdateTopicDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.updateTopic(slug, dto, user.id);
  }

  @Delete("topics/:slug")
  @HttpCode(204)
  deleteTopic(
    @Param("slug") slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.taxonomy.deleteTopic(slug, user.id);
  }

  // --- Reports --------------------------------------------------------------

  @Get("reports")
  @ApiOperation({ summary: "Student reports, newest first" })
  reports(@Query() query: AdminReportListQueryDto) {
    const { page, pageSize, ...filters } = query;
    return this.questions.listReports(filters, page, pageSize);
  }

  @Patch("reports/:id")
  @ApiOperation({ summary: "Resolve or dismiss a report" })
  resolveReport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.resolveReport(id, dto.status, dto.note, user.id);
  }
}
