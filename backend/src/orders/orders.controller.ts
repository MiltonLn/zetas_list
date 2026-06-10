import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('catalog')
  getCatalog() {
    return this.ordersService.getCatalog();
  }

  @Get('me')
  getMine(@CurrentUser() user: JwtUser) {
    return this.ordersService.findMine(user.id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtUser) {
    return this.ordersService.create(user.id, dto);
  }

  @Roles(Role.admin)
  @Get()
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  findAll(@Query('status') status?: OrderStatus) {
    return this.ordersService.findAll(status);
  }

  @Roles(Role.admin)
  @Post('admin/:userId')
  adminCreate(
    @Param('userId') userId: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.ordersService.adminCreate(actor.id, userId, dto);
  }

  @Roles(Role.admin)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.ordersService.update(id, dto, actor.id);
  }

  @Roles(Role.admin)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }
}
