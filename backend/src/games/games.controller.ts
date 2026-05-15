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
import { JwtUser } from '../auth/jwt-user.interface';
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
  create(@Body() dto: CreateGameDto, @CurrentUser() user: JwtUser) {
    return this.gamesService.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: GameStatus })
  @ApiQuery({ name: 'modalidad', required: false, enum: Modalidad })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'excludeStatus', required: false, type: String, description: 'Comma-separated statuses to exclude' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: GameStatus,
    @Query('excludeStatus') excludeStatus?: string,
    @Query('modalidad') modalidad?: Modalidad,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gamesService.findAll(user.role, {
      status,
      excludeStatus: excludeStatus
        ? (excludeStatus.split(',') as GameStatus[])
        : undefined,
      modalidad,
      search,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gamesService.findOne(id);
  }

  @Post(':id/register')
  register(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.gamesService.register(id, user.id, user.id);
  }

  @Post(':id/register-proxy/:targetUserId')
  registerProxy(
    @Param('id') id: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.register(id, targetUserId, user.id);
  }

  @Post(':id/register-guest')
  registerGuest(
    @Param('id') id: string,
    @Body() body: { guestName: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.registerGuest(id, body.guestName, user.id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.gamesService.confirmRegistration(id, user.id);
  }

  @Get(':id/available-members')
  getAvailableMembers(@Param('id') id: string) {
    return this.gamesService.getAvailableMembers(id);
  }

  @Roles(Role.admin)
  @Post(':id/register/:userId')
  registerUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.register(id, userId, user.id);
  }

  @Delete(':id/register/:userId')
  removeRegistration(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
    @Query('regId') regId?: string,
  ) {
    return this.gamesService.removeRegistration(id, userId, user.id, user.role as Role, { regId });
  }

  @Roles(Role.admin)
  @Patch(':id/registrations/:regId')
  updateRegistration(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Body() dto: UpdateRegistrationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.updateRegistration(regId, dto, user.id, id);
  }

  @Roles(Role.admin)
  @Post(':id/promote/:regId')
  promote(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.promote(id, regId, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/demote/:regId')
  demote(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.demote(id, regId, user.id);
  }

  @Roles(Role.admin)
  @Patch(':id/reorder')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.reorder(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelGameDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.cancel(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.gamesService.complete(id, user.id);
  }

  @Roles(Role.admin)
  @Get(':id/preview-report')
  previewReport(@Param('id') id: string) {
    return this.gamesService.previewReport(id);
  }

  @Roles(Role.admin)
  @Patch(':id/registrations/:regId/fine-exempt')
  setFineExempt(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Body() body: { exempt: boolean },
    @CurrentUser() user: JwtUser,
  ) {
    return this.gamesService.setFineExempt(id, regId, body.exempt, user.id);
  }

  @Get(':id/report')
  getReport(@Param('id') id: string) {
    return this.gamesService.getStoredReport(id);
  }

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
