import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class SaveReadingProgressDto {
  @ApiProperty({ example: 12, description: '1-based page the reader is on' })
  @IsInt()
  @Min(1)
  @Max(100_000)
  page!: number;

  @ApiProperty({ example: 240, description: 'Pages in the file being read' })
  @IsInt()
  @Min(1)
  @Max(100_000)
  pageCount!: number;

  @ApiPropertyOptional({ description: 'The file version `page` belongs to, as the read link reported it' })
  @IsOptional()
  @IsUUID()
  assetId?: string;
}

export class OpenForReadingQueryDto {
  @ApiPropertyOptional({
    description: 'True when the reader is renewing an expired link mid-read: checked again, not logged again.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  renew?: boolean;
}
