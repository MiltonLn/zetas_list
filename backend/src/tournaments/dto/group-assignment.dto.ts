import { IsOptional, IsObject, IsArray, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignGroupsDto {
  /** Manual map of teamId → groupLabel. If omitted, auto-assigns. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  assignments?: Record<string, string>;
}

export class GenerateBracketDto {
  /** Optional ordered list of teamIds to override automatic seeding. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seeding?: string[];
}
