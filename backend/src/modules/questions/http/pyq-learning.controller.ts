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
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { CollectionsService } from '../application/collections.service';
import { LearningService } from '../application/learning.service';
import {
  CreateCollectionDto,
  ReinforceQueryDto,
  UpdateCollectionDto,
  UpdatePreferencesDto,
} from './dto/learning.dto';

/**
 * The learning loop on top of practice: collections, streaks, revision,
 * reinforce and PYQ preferences. Every route is the signed-in user's own data.
 */
@ApiTags('pyq')
@ApiBearerAuth()
@Controller('pyq')
export class PyqLearningController {
  constructor(
    private readonly collections: CollectionsService,
    private readonly learning: LearningService,
  ) {}

  // --- Collections --------------------------------------------------------------

  @Get('collections')
  @ApiOperation({ summary: 'My collections, newest first, with question ids' })
  listCollections(@CurrentUser() user: AuthenticatedUser) {
    return this.collections.list(user.id);
  }

  @Post('collections')
  @ApiOperation({ summary: 'Create a collection' })
  createCollection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionDto) {
    return this.collections.create(user.id, dto);
  }

  @Patch('collections/:id')
  @ApiOperation({ summary: 'Rename / re-describe a collection' })
  updateCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collections.update(user.id, id, dto);
  }

  @Delete('collections/:id')
  @HttpCode(204)
  async deleteCollection(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.collections.remove(user.id, id);
  }

  @Put('collections/:id/questions/:questionId')
  @ApiOperation({ summary: 'Add a question to a collection (idempotent)' })
  addToCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.collections.addQuestion(user.id, id, questionId);
  }

  @Delete('collections/:id/questions/:questionId')
  @ApiOperation({ summary: 'Remove a question from a collection' })
  removeFromCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.collections.removeQuestion(user.id, id, questionId);
  }

  // --- Learning -----------------------------------------------------------------

  @Get('streak')
  @ApiOperation({ summary: 'Current/longest streak and today\'s progress (India-time days)' })
  streak(@CurrentUser() user: AuthenticatedUser) {
    return this.learning.streak(user.id);
  }

  @Get('revision')
  @ApiOperation({ summary: 'Attempted, bookmarked or collected questions with revision facts' })
  revision(@CurrentUser() user: AuthenticatedUser) {
    return this.learning.revision(user.id);
  }

  @Get('reinforce')
  @ApiOperation({ summary: 'Questions answered correctly, split by recency' })
  reinforce(@CurrentUser() user: AuthenticatedUser, @Query() query: ReinforceQueryDto) {
    return this.learning.reinforce(user.id, query.recentDays);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.learning.preferences(user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Save PYQ preferences (target exam, daily goal)' })
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.learning.updatePreferences(user.id, dto);
  }
}
