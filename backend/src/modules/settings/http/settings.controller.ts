import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { SettingsService } from '../application/settings.service';

/** Read-only, public: both the main website and the PDF store read this before sign-in. */
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Site-wide display toggles' })
  get() {
    return this.settings.get();
  }
}
