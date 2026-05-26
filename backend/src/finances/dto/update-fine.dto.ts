import {
  IsDateString,
  IsString,
  IsInt,
  Min,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FineStatus } from '@prisma/client';

export class UpdateFineDto {
  @ApiPropertyOptional({ description: 'User ID to link this fine to' })
  @IsOptional()
  @IsString()
  userId?: string | null;

  @ApiPropertyOptional({ example: '2026-01-17' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ example: 'Inasistencia' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: FineStatus })
  @IsOptional()
  @IsEnum(FineStatus)
  status?: FineStatus;
}
