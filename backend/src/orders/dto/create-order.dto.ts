import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShirtSize } from '@prisma/client';

export class OrderItemDto {
  @ApiProperty({ example: 'camiseta' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 'local' })
  @IsString()
  variantId!: string;

  @ApiPropertyOptional({ enum: ShirtSize })
  @IsOptional()
  @IsEnum(ShirtSize)
  size?: ShirtSize;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @ApiPropertyOptional({ example: 'ZURDO' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customName?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ example: 7, description: 'Número de camiseta (0-99), requerido si pides camisetas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  shirtNumber?: number;

  @ApiPropertyOptional({ example: 'Entregar antes del torneo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
