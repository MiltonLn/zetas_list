import {
  IsDateString,
  IsString,
  IsInt,
  Min,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FineStatus } from '@prisma/client';

export class CreateFineDto {
  @ApiProperty({ description: 'ID del usuario multado' })
  @IsString()
  userId: string;

  @ApiProperty({ example: '2026-01-17' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 5000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Inasistencia' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ enum: FineStatus, default: 'pending' })
  @IsOptional()
  @IsEnum(FineStatus)
  status?: FineStatus;

  @ApiPropertyOptional({ description: 'ID del partido asociado' })
  @IsOptional()
  @IsString()
  gameId?: string;

  @ApiPropertyOptional({ description: 'ID del registro de partido asociado' })
  @IsOptional()
  @IsString()
  gameRegistrationId?: string;
}
