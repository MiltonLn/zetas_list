import { IsBoolean } from 'class-validator';

export class FineExemptDto {
  @IsBoolean()
  exempt!: boolean;
}
