import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderDto {
  @ApiProperty({ description: 'Lista ordenada de IDs de GameRegistration para la lista principal' })
  @IsArray()
  @IsString({ each: true })
  mainList: string[];

  @ApiProperty({ description: 'Lista ordenada de IDs de GameRegistration para la lista de espera' })
  @IsArray()
  @IsString({ each: true })
  waitList: string[];
}
