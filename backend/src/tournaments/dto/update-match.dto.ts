import { IsArray, IsInt, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SetScoreDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  setNumber: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  scoreA: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  scoreB: number;
}

export class UpdateMatchDto {
  @ApiProperty({ type: [SetScoreDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets: SetScoreDto[];
}
