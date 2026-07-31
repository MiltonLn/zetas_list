import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  GroupMatchFormat,
  KnockoutMatchFormat,
  PairingStrategy,
  StandingsTiebreaker,
} from '../rules';

export class StandingsPointsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  straightWin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  splitWin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  splitLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  straightLoss?: number;
}

export class GroupStageRulesDto {
  @IsOptional()
  @IsIn(['two_sets_point_difference', 'best_of_three'])
  matchFormat?: GroupMatchFormat;

  @IsOptional()
  @IsInt()
  @Min(1)
  qualifiersPerGroup?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => StandingsPointsDto)
  standingsPoints?: StandingsPointsDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(['wins', 'setDifference', 'pointDifference', 'headToHead'], { each: true })
  tiebreakers?: StandingsTiebreaker[];

  @IsOptional()
  @IsInt()
  @Min(1)
  regularSetPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tiebreakSetPoints?: number;

  @IsOptional()
  @IsBoolean()
  winByTwo?: boolean;
}

export class KnockoutStageRulesDto {
  @IsOptional()
  @IsIn(['best_of_three'])
  matchFormat?: KnockoutMatchFormat;

  @IsOptional()
  @IsInt()
  @Min(1)
  regularSetPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tiebreakSetPoints?: number;

  @IsOptional()
  @IsBoolean()
  winByTwo?: boolean;

  @IsOptional()
  @IsBoolean()
  includeThirdPlace?: boolean;

  @IsOptional()
  @IsIn(['high_low', 'cross_group'])
  pairingStrategy?: PairingStrategy;
}

export class CompetitionRulesDto {
  @ApiPropertyOptional({ enum: [1], default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1)
  version?: 1;

  @ApiPropertyOptional({ type: GroupStageRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GroupStageRulesDto)
  groupStage?: GroupStageRulesDto;

  @ApiPropertyOptional({ type: KnockoutStageRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => KnockoutStageRulesDto)
  knockoutStage?: KnockoutStageRulesDto;
}
