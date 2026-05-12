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

  @ApiPropertyOptional({
    example: '10:00',
    default: '10:00',
    description: 'Hora a la que se abre el registro (mismo día del partido). Default: 10:00 AM Colombia',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato de hora inválido (HH:mm)' })
  registrationOpenTime?: string;

  @ApiPropertyOptional({ example: 2000, default: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerPlayer?: number;

  @ApiPropertyOptional({ example: 10000, default: 10000, description: 'Costo del vigilante' })
  @IsOptional()
  @IsInt()
  @Min(0)
  vigilante?: number;

  @ApiPropertyOptional({ description: 'Sobrescribir spots máximos (por defecto según modalidad)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  maxMainSpots?: number;

  @ApiPropertyOptional({ description: 'Título personalizado (se auto-genera si no se provee)' })
  @IsOptional()
  @IsString()
  customTitle?: string;
}
