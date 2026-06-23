import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeamPlayerDto {
  @ApiPropertyOptional({ description: 'User ID for Zetas members' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Name for external guests (non-members)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  guestName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCaptain?: boolean;
}

export class RegisterTeamDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ type: [TeamPlayerDto], description: 'Players list — optional, can be filled later' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamPlayerDto)
  players?: TeamPlayerDto[];
}

export class UpdateTeamPaymentDto {
  @ApiProperty()
  @IsBoolean()
  paid: boolean;
}
