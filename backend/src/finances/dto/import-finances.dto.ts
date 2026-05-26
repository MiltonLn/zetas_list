import { IsArray, ValidateNested, IsEnum, IsDateString, IsString, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, FineStatus } from '@prisma/client';

export class ImportTransactionItem {
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
}

export class ImportFineItem {
  @ApiPropertyOptional({ description: 'Phone number (username) of the user' })
  @IsOptional()
  @IsString()
  userPhone?: string;

  @ApiPropertyOptional({ description: 'Display name (used when user is not yet linked)' })
  @IsOptional()
  @IsString()
  userName?: string;

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
}

export class ImportFinancesDto {
  @ApiProperty({ type: [ImportTransactionItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTransactionItem)
  transactions: ImportTransactionItem[];

  @ApiProperty({ type: [ImportFineItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportFineItem)
  fines: ImportFineItem[];
}
