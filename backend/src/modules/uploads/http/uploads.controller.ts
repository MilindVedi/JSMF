import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { UploadService } from '../application/upload.service';
import type { UploadActor } from '../application/upload-purpose';

export class StartUploadDto {
  @ApiProperty({ example: 'product.primary_file', description: 'What the file is for (GET /uploads/options lists them).' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, { message: 'purpose must look like "product.primary_file"' })
  @MaxLength(60)
  purpose!: string;

  @ApiPropertyOptional({ description: 'The product, session or user it is for, when the purpose has one.' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ description: "The purpose's own options, e.g. { sectionId } for a session screenshot." })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiProperty({ example: 'anatomy-notes.pdf', description: 'Shown in lists; never part of the stored path.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @Matches(/^[a-z]+\/[a-z0-9.+-]+$/, { message: 'contentType must be a MIME type' })
  @MaxLength(120)
  contentType!: string;

  @ApiProperty({ description: 'Exact size in bytes. The storage session accepts this many and no other.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

function actorOf(user: AuthenticatedUser, request: Request): UploadActor {
  return { id: user.id, ip: request.ip ?? null, roles: user.roles };
}

/**
 * Every upload that goes straight to storage, whatever it is for: start here,
 * send the bytes to the returned URL, then complete here. Signed-in only (the
 * global guard); who may upload what is each purpose's rule, checked in
 * UploadService.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Get('options')
  @ApiOperation({ summary: 'The kinds of upload this person may start, with their limits' })
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.uploads.options(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Start an upload',
    description:
      "Returns a storage session URL locked to this file's exact size, type and a new object key. " +
      'The browser sends the bytes there in pieces, then calls complete.',
  })
  start(
    @Body() dto: StartUploadDto,
    @Headers('origin') origin: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.uploads.start(
      {
        purpose: dto.purpose,
        targetId: dto.targetId ?? null,
        context: dto.context,
        filename: dto.filename,
        mimeType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        origin,
      },
      actorOf(user, request),
    );
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Finish an upload',
    description:
      'Checks what arrived (size, type, format) and hands it to its purpose, which records it. ' +
      'Calling it again after success returns the same result.',
  })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.uploads.complete(id, actorOf(user, request));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel an upload; anything that reached storage is removed' })
  async abort(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.uploads.abort(id, actorOf(user, request));
  }
}
