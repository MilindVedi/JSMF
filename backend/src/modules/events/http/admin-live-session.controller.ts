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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { actorFrom } from '../../catalog/http/actor';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { LiveSessionService } from '../application/live-session.service';
import { CreateLiveSessionDto, UpdateLiveSessionDto } from './dto/live-session.dto';

@ApiTags('admin: sessions')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/sessions')
export class AdminLiveSessionController {
  constructor(private readonly sessions: LiveSessionService) {}

  @Get()
  @ApiOperation({ summary: 'Every session, newest first, with seats taken' })
  list() {
    return this.sessions.listForAdmin();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.getForAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a session (as a draft)' })
  create(
    @Body() dto: CreateLiveSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.create(dto, actorFrom(user, request));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.update(id, dto, actorFrom(user, request));
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.publish(id, actorFrom(user, request));
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.unpublish(id, actorFrom(user, request));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archive (soft delete). Sold seats stay valid and refundable.' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.sessions.archive(id, actorFrom(user, request));
  }

  @Get(':id/registrations')
  @ApiOperation({ summary: 'Registrations, with whether each person has paid' })
  registrations(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.registrationsForAdmin(id);
  }
}
