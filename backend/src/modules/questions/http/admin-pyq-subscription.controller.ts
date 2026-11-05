import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AppConfig } from '../../../config/config.module';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { PyqPlanAdminService, type AdminPlanView } from '../application/pyq-plan-admin.service';
import { PyqPlansService } from '../application/pyq-plans.service';
import { PyqSubscriptionService, type SubscriptionSettings } from '../application/pyq-subscription.service';
import type { Actor } from '../application/subscription-management';
import { CreatePlanDto, SetPlanOnSaleDto, UpdatePlanDto, UpdateSubscriptionSettingsDto } from './dto/subscription.dto';

export interface AdminSubscriptionOverview {
  /**
   * Mirrors SUBSCRIPTION_MANAGEMENT_ENABLED, read-only, so the page can say
   * why it is read-only instead of offering buttons the server will refuse.
   * No endpoint accepts it: an admin cannot grant themselves this.
   */
  managementEnabled: boolean;
  settings: SubscriptionSettings;
  plans: AdminPlanView[];
}

/** Ten saves a minute is far beyond any real editing session, and a ceiling on a stolen session. */
const WRITE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

function actorFrom(user: AuthenticatedUser, request: Request): Actor {
  return { id: user.id, ip: request.ip ?? null };
}

/**
 * Subscription & pricing management. ADMIN only (educators can edit products
 * but not plans). Reads always work; every write is refused with 409 unless
 * the deployment sets SUBSCRIPTION_MANAGEMENT_ENABLED=true — enforced in the
 * services, so this controller is not the only thing standing in the way.
 */
@ApiTags('admin: pyq')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/pyq/subscription')
export class AdminPyqSubscriptionController {
  constructor(
    private readonly config: AppConfig,
    private readonly subscriptions: PyqSubscriptionService,
    private readonly planAdmin: PyqPlanAdminService,
    private readonly plans: PyqPlansService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Plans, the free trial, the shared benefits — and whether they may be changed' })
  async overview(): Promise<AdminSubscriptionOverview> {
    const [settings, plans] = await Promise.all([this.subscriptions.settings(), this.planAdmin.list()]);
    return { managementEnabled: this.config.get('SUBSCRIPTION_MANAGEMENT_ENABLED'), settings, plans };
  }

  @Patch('settings')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({ summary: 'Change the free trial or the shared benefits list (409 while management is off)' })
  async updateSettings(
    @Body() dto: UpdateSubscriptionSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SubscriptionSettings> {
    const settings = await this.subscriptions.updateSettings(dto, actorFrom(user, request));
    // The benefits are part of every plan card.
    await this.plans.invalidate();
    return settings;
  }

  @Post('plans')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({ summary: 'Create a plan (409 while management is off)' })
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.planAdmin.create(dto, actorFrom(user, request));
  }

  @Patch('plans/:id')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({
    summary: 'Edit a plan (409 while management is off)',
    description:
      'A new price or length replaces the plan with a new version and returns it (new id); the old one ' +
      'goes off sale and stays valid for everyone on it. Other fields change in place.',
  })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.planAdmin.update(id, dto, actorFrom(user, request));
  }

  @Put('plans/:id/on-sale')
  @Throttle(WRITE_LIMIT)
  @ApiOperation({ summary: 'Put a plan on sale or take it off (409 while management is off)' })
  setOnSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPlanOnSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.planAdmin.setOnSale(id, dto.onSale, actorFrom(user, request));
  }
}
