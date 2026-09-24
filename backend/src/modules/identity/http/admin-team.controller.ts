import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminInvitationService } from '../application/admin-invitation.service';
import type { AuthenticatedUser, RequestContext, SessionTokens } from '../application/auth.service';
import { AcceptInvitationDto, InviteAdminDto } from './dto/admin-invitation.dto';

/**
 * Managing who has admin access.
 *
 * ADMIN only — not EDUCATOR. Being able to create administrators is the
 * privilege that grants every other privilege, so it is held by the narrowest
 * possible role.
 */
@ApiTags('admin: team')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/team')
export class AdminTeamController {
  constructor(private readonly invitations: AdminInvitationService) {}

  @Get()
  @ApiOperation({ summary: 'List current admins' })
  listAdmins() {
    return this.invitations.listAdmins();
  }

  @Get('invitations')
  @ApiOperation({ summary: 'List invitations that have not been accepted yet' })
  listInvitations() {
    return this.invitations.listPendingInvitations();
  }

  @Post('invitations')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Invite someone to become an admin',
    description: 'Emails a single-use link to the invitee. Expires in 48 hours.',
  })
  invite(
    @Body() dto: InviteAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.invitations.invite(dto, actor, contextOf(request));
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.invitations.revokeInvitation(id, actor, contextOf(request));
  }
}

/**
 * Accepting an invitation, which is necessarily unauthenticated — the invitee
 * has no account yet. The emailed token is the credential.
 */
@ApiTags('auth: admin invitation')
@Controller('auth/invitation')
export class AdminInvitationController {
  constructor(private readonly invitations: AdminInvitationService) {}

  @Public()
  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check an invitation and read who it is for' })
  peek(@Param('token') token: string) {
    return this.invitations.peek(token);
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Accept an invitation with a password and start a session' })
  accept(
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    return this.invitations.acceptWithPassword(dto, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}
