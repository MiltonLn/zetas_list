import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRegistrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attended?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
