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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { Role, TournamentStatus } from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/create-tournament.dto';
import { RegisterTeamDto, UpdateTeamPaymentDto } from './dto/register-team.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { AssignGroupsDto, GenerateBracketDto } from './dto/group-assignment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { Public } from '../common/decorators/public.decorator';

const UPLOADS_RULES = join(process.cwd(), 'uploads', 'tournament-rules');
const UPLOADS_FLYERS = join(process.cwd(), 'uploads', 'tournament-flyers');
if (!existsSync(UPLOADS_RULES)) mkdirSync(UPLOADS_RULES, { recursive: true });
if (!existsSync(UPLOADS_FLYERS)) mkdirSync(UPLOADS_FLYERS, { recursive: true });

@ApiTags('tournaments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  // ---------------------------------------------------------------------------
  // Tournament CRUD (admin)
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Post()
  create(@Body() dto: CreateTournamentDto, @CurrentUser() user: JwtUser) {
    return this.tournamentsService.create(dto, user.id);
  }

  @Public()
  @Get()
  @ApiQuery({ name: 'status', required: false, enum: TournamentStatus })
  findAll(@Query('status') status?: TournamentStatus) {
    return this.tournamentsService.findAll(status);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @Roles(Role.admin)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.update(id, dto, user.id);
  }

  // ---------------------------------------------------------------------------
  // Status transitions (admin)
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Post(':id/open-registration')
  openRegistration(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.tournamentsService.openRegistration(id, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/start')
  startTournament(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.tournamentsService.startTournament(id, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/complete')
  completeTournament(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.tournamentsService.completeTournament(id, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/cancel')
  cancelTournament(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.tournamentsService.cancelTournament(id, user.id);
  }

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------

  @Post(':id/teams')
  registerTeam(
    @Param('id') tournamentId: string,
    @Body() dto: RegisterTeamDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.registerTeam(tournamentId, dto, user.id);
  }

  @Roles(Role.admin)
  @Delete(':id/teams/:teamId')
  removeTeam(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.removeTeam(tournamentId, teamId, user.id);
  }

  @Roles(Role.admin)
  @Patch(':id/teams/:teamId/payment')
  updateTeamPayment(
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamPaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.updateTeamPayment(teamId, dto, user.id);
  }

  // ---------------------------------------------------------------------------
  // Standings
  // ---------------------------------------------------------------------------

  @Get(':id/standings')
  getGroupStandings(@Param('id') tournamentId: string) {
    return this.tournamentsService.getGroupStandings(tournamentId);
  }

  // ---------------------------------------------------------------------------
  // Group management
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Post(':id/assign-groups')
  assignGroups(
    @Param('id') tournamentId: string,
    @Body() dto: AssignGroupsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.assignGroups(tournamentId, user.id, dto.assignments);
  }

  @Roles(Role.admin)
  @Post(':id/generate-matches')
  generateGroupMatches(
    @Param('id') tournamentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.generateGroupMatches(tournamentId, user.id);
  }

  // ---------------------------------------------------------------------------
  // Knockout bracket
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Post(':id/generate-bracket')
  generateKnockoutBracket(
    @Param('id') tournamentId: string,
    @Body() dto: GenerateBracketDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.generateKnockoutBracket(tournamentId, user.id, dto.seeding);
  }

  @Roles(Role.admin)
  @Post(':id/advance-winners')
  advanceWinners(
    @Param('id') tournamentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.advanceWinners(tournamentId, user.id);
  }

  // ---------------------------------------------------------------------------
  // Matches
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Patch('matches/:matchId/cancel')
  cancelMatch(
    @Param('matchId') matchId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.cancelMatch(matchId, user.id);
  }

  @Roles(Role.admin)
  @Patch('matches/:matchId')
  updateMatchScore(
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tournamentsService.updateMatchScore(matchId, dto, user.id);
  }

  // ---------------------------------------------------------------------------
  // File uploads
  // ---------------------------------------------------------------------------

  @Roles(Role.admin)
  @Post(':id/rules-pdf')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_RULES,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.pdf'}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se permiten archivos PDF'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadRulesPdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No se envió ningún archivo');
    const url = `/uploads/tournament-rules/${file.filename}`;
    return this.tournamentsService.updateRulesFile(id, url, user.id);
  }

  @Roles(Role.admin)
  @Post(':id/flyer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_FLYERS,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Solo se permiten imágenes'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadFlyer(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No se envió ningún archivo');
    const url = `/uploads/tournament-flyers/${file.filename}`;
    return this.tournamentsService.updateFlyer(id, url, user.id);
  }
}
