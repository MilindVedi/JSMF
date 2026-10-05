import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AppConfig } from '../../../config/config.module';
import { actorFrom } from '../../catalog/http/actor';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { SettingsService, type PlatformSettingsDto } from '../application/settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-settings.dto';

/**
 * What the admin panel is told, which is the stored toggles **plus** the
 * deployment's own capability flags.
 *
 * The two are not the same kind of thing and are deliberately not stored the
 * same way. A toggle lives in the database because an admin may change it; a
 * capability reflects an environment variable the operator set, and appears
 * here read-only so the UI can stop offering something the server will refuse.
 */
export interface AdminSettingsResponse extends PlatformSettingsDto {
  /**
   * Whether `POST /admin/orders/:id/refund` will act rather than answer 409.
   *
   * Read-only on purpose: it mirrors `REFUNDS_ENABLED`, which is an operator
   * decision made at deploy time. Accepting it on the PATCH below would let an
   * admin grant themselves the ability to move money straight back out of the
   * account — exactly the thing the environment variable exists to withhold.
   */
  refundsEnabled: boolean;
}

@ApiTags('admin: settings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Site-wide display toggles, and what this deployment permits' })
  async get(): Promise<AdminSettingsResponse> {
    return {
      ...(await this.settings.get()),
      refundsEnabled: this.config.get('REFUNDS_ENABLED'),
    };
  }

  /**
   * Only the stored toggles are writable — `UpdatePlatformSettingsDto` has no
   * `refundsEnabled` field, so a request carrying one is rejected rather than
   * silently ignored. The capability is echoed back unchanged so a client can
   * replace its whole settings object with the response, the same shape `GET`
   * returned, instead of having to merge the two by hand.
   */
  @Patch()
  @ApiOperation({ summary: 'Change a site-wide display toggle' })
  async update(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AdminSettingsResponse> {
    return {
      ...(await this.settings.update(dto, actorFrom(user, request))),
      refundsEnabled: this.config.get('REFUNDS_ENABLED'),
    };
  }
}
