import {
  IsArray,
  IsInt,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SetScoreDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(3)
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
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ArrayUnique((set: SetScoreDto) => set.setNumber)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets: SetScoreDto[];
}
