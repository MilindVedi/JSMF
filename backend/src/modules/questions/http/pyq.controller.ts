import {
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { PracticeService } from '../application/practice.service';
import { ProgressService } from '../application/progress.service';
import { PyqAccessService } from '../application/pyq-access.service';
import { QuestionBankService } from '../application/question-bank.service';
import {
  AnswerDto,
  FlagDto,
  ListQuestionsQueryDto,
  PageQueryDto,
  ReportQuestionDto,
  StartSessionDto,
} from './dto/questions.dto';

/**
 * The PYQ practice app's API. Everything except the taxonomy needs a
 * signed-in user, and every read is scoped to that user.
 */
@ApiTags('pyq')
@ApiBearerAuth()
@Controller('pyq')
export class PyqController {
  constructor(
    private readonly bank: QuestionBankService,
    private readonly practice: PracticeService,
    private readonly progress: ProgressService,
    private readonly access: PyqAccessService,
  ) {}

  @Get('taxonomy')
  @Public()
  @ApiOperation({
    summary: 'Exams, subjects and topics with published question counts',
  })
  taxonomy() {
    return this.bank.taxonomy();
  }

  @Get('access')
  @ApiOperation({
    summary: 'Subscription state and remaining free questions today',
  })
  myAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.access.describe(user.id);
  }

  @Get('questions')
  @ApiOperation({
    summary: 'Browse questions (never includes answers or explanations)',
  })
  questions(@CurrentUser() user: AuthenticatedUser, @Query() query: ListQuestionsQueryDto) {
    const { page, pageSize, ...filters } = query;
    return this.bank.list(user.id, filters, page, pageSize);
  }

  @Post('questions/:id/reports')
  @ApiOperation({ summary: 'Report a problem with a question' })
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) questionId: string,
    @Body() dto: ReportQuestionDto,
  ) {
    return this.progress.report(user.id, questionId, dto);
  }

  // --- Sessions ---------------------------------------------------------------

  @Post('sessions')
  @ApiOperation({
    summary: 'Start a session from filters or an explicit list of questions',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSessionDto) {
    return this.practice.start(user.id, dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Session history, newest first' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQueryDto) {
    return this.practice.history(user.id, query.page, query.pageSize);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'A session; answers hidden in an unsubmitted TEST' })
  session(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.practice.get(user.id, id);
  }

  @Post('sessions/:id/answers')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Answer a question (feedback returned immediately unless TEST)',
  })
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerDto,
  ) {
    return this.practice.answer(user.id, id, dto);
  }

  @Patch('sessions/:id/questions/:questionId/flag')
  flag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: FlagDto,
  ) {
    return this.practice.flag(user.id, id, questionId, dto.flagged);
  }

  @Post('sessions/:id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit and score; returns the review' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.practice.submit(user.id, id);
  }

  @Get('sessions/:id/review')
  @ApiOperation({ summary: 'Answers and explanations for a submitted session' })
  review(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.practice.review(user.id, id);
  }

  // --- Progress ---------------------------------------------------------------

  @Get('bookmarks')
  bookmarks(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.listBookmarks(user.id);
  }

  @Put('bookmarks/:questionId')
  @ApiOperation({ summary: 'Bookmark a question (idempotent)' })
  addBookmark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.progress.addBookmark(user.id, questionId);
  }

  @Delete('bookmarks/:questionId')
  @HttpCode(204)
  async removeBookmark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    await this.progress.removeBookmark(user.id, questionId);
  }

  @Get('wrong-questions')
  @ApiOperation({ summary: 'Questions whose latest answer was wrong' })
  wrongQuestions(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.wrongQuestions(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Accuracy overall, by subject, and over time' })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.stats(user.id);
  }
}
