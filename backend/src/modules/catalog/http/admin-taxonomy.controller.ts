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
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { TaxonomyService } from '../application/taxonomy.service';
import { actorFrom } from './actor';
import {
  CreateTaxonomyDto,
  CreateTermDto,
  UpdateTaxonomyDto,
  UpdateTermDto,
} from './dto/taxonomy.dto';

/**
 * ADMIN only, unlike products which educators may also manage.
 *
 * A taxonomy is master data shared by the whole catalogue: renaming or removing
 * a term affects every product carrying it and every saved filter link, so it
 * is a narrower privilege than editing one's own PDF.
 */
@ApiTags('admin: taxonomy')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/taxonomies')
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  @ApiOperation({ summary: 'Every taxonomy with its terms — drives the admin form' })
  list() {
    return this.taxonomy.listWithTerms();
  }

  @Post()
  @ApiOperation({
    summary: 'Add a category kind',
    description:
      'This is the extensibility promise in practice: a new kind of category is a row here, ' +
      'not a migration. The admin form and storefront filters pick it up automatically.',
  })
  create(
    @Body() dto: CreateTaxonomyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.taxonomy.createTaxonomy(dto, actorFrom(user, request));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxonomyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.taxonomy.updateTaxonomy(id, dto, actorFrom(user, request));
  }

  @Post(':id/terms')
  createTerm(
    @Param('id', ParseUUIDPipe) taxonomyId: string,
    @Body() dto: CreateTermDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.taxonomy.createTerm({ ...dto, taxonomyId }, actorFrom(user, request));
  }

  @Patch('terms/:termId')
  updateTerm(
    @Param('termId', ParseUUIDPipe) termId: string,
    @Body() dto: UpdateTermDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.taxonomy.updateTerm(termId, dto, actorFrom(user, request));
  }

  @Delete('terms/:termId')
  @ApiOperation({
    summary: 'Soft-delete an unused term',
    description:
      'Refused while any product still carries it, or while it still has children. The ' +
      'foreign keys are ON DELETE RESTRICT for the same reason: deleting a term must never ' +
      'silently untag the catalogue. Reversible via /restore.',
  })
  @HttpCode(204)
  async deleteTerm(
    @Param('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.taxonomy.deleteTerm(termId, actorFrom(user, request));
  }

  @Post('terms/:termId/restore')
  restoreTerm(
    @Param('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.taxonomy.restoreTerm(termId, actorFrom(user, request));
  }
}
