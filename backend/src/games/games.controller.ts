import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Sse,
  MessageEvent,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { Role, GameStatus, Modalidad } from '@prisma/client';
import { Response } from 'express';
import { GamesService } from './games.service';
import { GameEventsService } from './game-events.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReorderDto } from './dto/reorder.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('games')
export class GamesController {
  constructor(
    private gamesService: GamesService,
    private events: GameEventsService,
    private audit: AuditService,
  ) {}

  @Roles(Role.admin)
  @Post()
  create(@Body() dto: CreateGameDto, @CurrentUser() user: any) {
    return this.gamesService.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: GameStatus })
  @ApiQuery({ name: 'modalidad', required: false, enum: Modalidad })
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: GameStatus,
    @Query('modalidad') modalidad?: Modalidad,
  ) {
    return this.gamesService.findAll(user.role, { status, modalidad });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gamesService.findOne(id);
  }

  @Post(':id/register')
  register(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.register(id, user.id, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/register/:userId')
  registerUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.register(id, userId, user.id);
  }

  @Delete(':id/register/:userId')
  removeRegistration(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.removeRegistration(id, userId, user.id, user.role);
  }

  @Roles(Role.admin)
  @Patch(':id/registrations/:regId')
  updateRegistration(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Body() dto: UpdateRegistrationDto,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.updateRegistration(regId, dto, user.id, id);
  }

  @Roles(Role.admin)
  @Post(':id/promote/:regId')
  promote(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.promote(id, regId, user.id);
  }

  @Roles(Role.admin)
  @Patch(':id/reorder')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.reorder(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelGameDto,
    @CurrentUser() user: any,
  ) {
    return this.gamesService.cancel(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.complete(id, user.id);
  }

  @Get(':id/report')
  async getReport(@Param('id') id: string) {
    const game = await this.gamesService.findOne(id);
    return { report: this.gamesService.generateReport(game) };
  }

  @Roles(Role.admin)
  @Get(':id/audit')
  getAudit(@Param('id') id: string) {
    return this.audit.findByGame(id);
  }

  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    const disconnect$ = new Subject<void>();

    res.on('close', () => disconnect$.next());

    const heartbeat$ = interval(30000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'heartbeat' }) }) as MessageEvent),
      takeUntil(disconnect$),
    );

    const updates$ = this.events.forGame(id).pipe(takeUntil(disconnect$));

    return merge(heartbeat$, updates$);
  }
}
