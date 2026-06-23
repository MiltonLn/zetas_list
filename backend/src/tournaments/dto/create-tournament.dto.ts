import {
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { TournamentFormat, Modalidad } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTournamentDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  name: string;

  @ApiProperty({ enum: TournamentFormat })
  @IsEnum(TournamentFormat)
  format: TournamentFormat;

  @ApiProperty({ enum: Modalidad })
  @IsEnum(Modalidad)
  modalidad: Modalidad;

  @ApiProperty()
  @IsDateString()
  registrationOpenAt: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerTeam?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prizeDescription?: string;

  @ApiProperty()
  @IsInt()
  @Min(2)
  maxTeams: number;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minPlayersPerTeam?: number;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPlayersPerTeam?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minZetasMembers?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowExternalTeams?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfGroups?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rulesFileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flyerUrl?: string;
}

export class UpdateTournamentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional({ enum: TournamentFormat })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiPropertyOptional({ enum: Modalidad })
  @IsOptional()
  @IsEnum(Modalidad)
  modalidad?: Modalidad;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationOpenAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerTeam?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prizeDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2)
  maxTeams?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  minPlayersPerTeam?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPlayersPerTeam?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minZetasMembers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowExternalTeams?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfGroups?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rulesFileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flyerUrl?: string;
}
