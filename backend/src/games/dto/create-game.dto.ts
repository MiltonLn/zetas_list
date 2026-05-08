import {
  IsEnum,
  IsDateString,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Modalidad } from '@prisma/client';

export class CreateGameDto {
  @ApiProperty({ enum: Modalidad })
  @IsEnum(Modalidad)
  modalidad: Modalidad;

  @ApiProperty({ example: '2026-05-15' })
  @IsDateString()
  gameDate: string;

  @ApiPropertyOptional({ example: '19:50', default: '19:50' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato de hora inválido (HH:mm)' })
  startTime?: string;

  @ApiProperty({ example: '2026-05-15T20:00:00.000Z', description: 'Fecha y hora en que se abre el registro' })
  @IsDateString()
  registrationOpenAt: string;

  @ApiPropertyOptional({ example: 2000, default: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerPlayer?: number;

  @ApiPropertyOptional({ description: 'Sobrescribir spots máximos (por defecto según modalidad)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  maxMainSpots?: number;
}
