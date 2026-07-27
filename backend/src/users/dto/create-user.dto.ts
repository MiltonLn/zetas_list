import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsArray,
  Min,
  Max,
  IsDateString,
  IsUrl,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Position, Gender } from '@prisma/client';

export class CreateUserDto {
  @ApiPropertyOptional({ example: '573001234567', description: 'Opcional — se deriva del phone si no se envía' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'Contraseña1!', description: 'Si no se envía, se usa Zetas2026!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Juancho', description: 'Nombre que aparece en la lista de juego. Si está vacío se usa el nombre real.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  alias?: string;

  @ApiProperty({ example: '573001234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?\d{7,15}$/, { message: 'Formato de teléfono inválido' })
  phone: string;

  @ApiPropertyOptional({ enum: Role, default: Role.member })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: Position, isArray: true, description: 'Posiciones en las que juega (puede ser más de una).' })
  @IsOptional()
  @IsArray()
  @IsEnum(Position, { each: true })
  positions?: Position[];

  @ApiPropertyOptional({ example: 3.5, description: 'Nivel de habilidad de 0.0 a 5.0 (un decimal). Solo editable y visible por admins.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  skillLevel?: number;

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

  @ApiPropertyOptional({ example: 'Me encanta el voleibol' })
  @IsOptional()
  @IsString()
  bio?: string;
}
