import { ApiPropertyOptional } from '@nestjs/swagger';
import { JsmfApp } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, Matches } from 'class-validator';

export class AnalyticsSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'First India-time day, inclusive. Default: 13 days before `to`.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-14', description: 'Last India-time day, inclusive. Default: today.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: JsmfApp, default: JsmfApp.MAIN })
  @IsOptional()
  @IsEnum(JsmfApp)
  app?: JsmfApp;
}

export class FinanceSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'First India-time day, inclusive. Default: 29 days before `to`.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-30', description: 'Last India-time day, inclusive. Default: today.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'true: from the first paid order to today; `from`/`to` are ignored.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}
