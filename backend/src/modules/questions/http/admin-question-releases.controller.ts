import { Body, Controller, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { QuestionReleaseService } from '../application/question-release.service';
import { ReleaseApplyDto, ReleasePreviewDto } from './dto/release.dto';
import { InvalidateTaxonomyInterceptor } from './invalidate-taxonomy.interceptor';

/**
 * Content releases: reviewed questions exported from the editorial copy and
 * pushed here (application/question-release.ts). Admin only, like every other
 * way of writing questions; the push's images go through the uploads API
 * ("pyq.release_image"), straight to storage.
 */
@ApiTags('admin: pyq')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/pyq/releases')
export class AdminQuestionReleasesController {
  constructor(private readonly releases: QuestionReleaseService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'What pushing these release questions would do. Writes nothing.' })
  preview(@Body() dto: ReleasePreviewDto) {
    return this.releases.preview(dto);
  }

  @Post('apply')
  @HttpCode(200)
  @UseInterceptors(InvalidateTaxonomyInterceptor)
  @ApiOperation({
    summary:
      'Push release questions: new ones as drafts, changed ones updated, conflicts only when listed in `overwrite`. Safe to repeat.',
  })
  apply(@Body() dto: ReleaseApplyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.releases.apply(
      {
        name: dto.name,
        exams: dto.exams ?? [],
        subjects: dto.subjects ?? [],
        topics: dto.topics ?? [],
        questions: dto.questions,
        overwrite: dto.overwrite ?? [],
      },
      user.id,
    );
  }
}
