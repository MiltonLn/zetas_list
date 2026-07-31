import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Position, Gender, ShirtSize } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Juancho', description: 'Nombre que aparece en la lista de juego. Si está vacío se usa el nombre real.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  alias?: string;

  @ApiPropertyOptional({ enum: Position })
  @IsOptional()
  @IsEnum(Position)
  position?: Position;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 175 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(250)
  heightCm?: number;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ example: 'Me encanta el voleibol 🏐' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ enum: ShirtSize })
  @IsOptional()
  @IsEnum(ShirtSize)
  shirtSize?: ShirtSize;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  shirtNumber?: number;
}
