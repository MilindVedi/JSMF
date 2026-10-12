import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { PyqPlansService } from '../application/pyq-plans.service';

/** Buying a plan is the ordinary `POST /orders` with the plan's id. */
@ApiTags('pyq')
@Controller('pyq/plans')
export class PyqPlansController {
  constructor(private readonly plans: PyqPlansService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @Public()
  @ApiOperation({ summary: 'Published PYQ subscription plans with price, duration and features' })
  list() {
    return this.plans.list();
  }
}
