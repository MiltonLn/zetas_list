import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelGameDto {
  @ApiProperty({ example: 'No hay suficientes jugadores' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
