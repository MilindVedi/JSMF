import { Body, Controller, Get, Param, Patch, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { ExamSetupService } from '../application/exam-setup.service';
import { SaveExamPatternDto, UpdatePracticeSettingsDto } from './dto/exam-setup.dto';

/** Ten saves a minute is far beyond any real editing session, and a ceiling on a stolen session. */
const WRITE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * PYQ → Exam setup: the option-shuffle switch and each exam's paper pattern
 * (sections, timings, marking) that full mocks follow. ADMIN only; every
 * change is audited by the service in the same transaction.
 */
@ApiTags('admin: pyq')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/pyq/exam-setup')
export class AdminExamSetupController {
  constructor(private readonly examSetup: ExamSetupService) {}

  @Get()
  @ApiOperation({ summary: 'The shuffle switch, and every exam with its pattern and published question count' })
  overview() {
    return this.examSetup.adminOverview();
  }

  @Patch('settings')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({ summary: 'Turn option shuffling on or off for sessions started from now on' })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Body() dto: UpdatePracticeSettingsDto,
  ) {
    return this.examSetup.updateSettings(dto, { id: user.id, ip: request.ip ?? null });
  }

  @Put('patterns/:examId')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({ summary: "Save an exam's pattern. Mocks already running keep the copy they started with." })
  savePattern(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Param('examId') examId: string,
    @Body() dto: SaveExamPatternDto,
  ) {
    return this.examSetup.savePattern(examId, dto, { id: user.id, ip: request.ip ?? null });
  }
}
