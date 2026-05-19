import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ description: 'Razón del baneo (requerida si status=banned)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
