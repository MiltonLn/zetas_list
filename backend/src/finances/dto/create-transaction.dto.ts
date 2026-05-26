import {
  IsEnum,
  IsDateString,
  IsString,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: '2026-01-18' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 12000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Candado Nuevo' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'ID del partido asociado (para entradas automáticas)' })
  @IsOptional()
  @IsString()
  gameId?: string;
}
