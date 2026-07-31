import { BadRequestException } from '@nestjs/common';
import {
  Modalidad,
  Role,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { JwtUser } from '../auth/jwt-user.interface';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

describe('TournamentsController', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    openRegistration: jest.fn(),
    startTournament: jest.fn(),
    completeTournament: jest.fn(),
    cancelTournament: jest.fn(),
    registerTeam: jest.fn(),
    removeTeam: jest.fn(),
    updateTeamPayment: jest.fn(),
    getGroupStandings: jest.fn(),
    assignGroups: jest.fn(),
    generateGroupMatches: jest.fn(),
    generateKnockoutBracket: jest.fn(),
    advanceWinners: jest.fn(),
    cancelMatch: jest.fn(),
    updateMatchScore: jest.fn(),
    updateRulesFile: jest.fn(),
    updateFlyer: jest.fn(),
  };
  const user: JwtUser = {
    id: 'admin-1',
    username: 'admin',
    role: Role.admin,
    mustChangePassword: false,
  };
  const createDto = {
    name: 'Torneo Zetas',
    format: TournamentFormat.groups_and_knockout,
    modalidad: Modalidad.seis_x_seis,
    registrationOpenAt: '2026-08-01',
    startDate: '2026-08-15',
    endDate: '2026-08-15',
    maxTeams: 8,
  };
  let controller: TournamentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TournamentsController(
      service as unknown as TournamentsService,
    );
  });

  it('delega el CRUD y las transiciones de estado', () => {
    const updateDto = { name: 'Torneo actualizado' };

    controller.create(createDto, user);
    controller.findAll(TournamentStatus.draft);
    controller.findOne('tournament-1');
    controller.update('tournament-1', updateDto, user);
    controller.openRegistration('tournament-1', user);
    controller.startTournament('tournament-1', user);
    controller.completeTournament('tournament-1', user);
    controller.cancelTournament('tournament-1', user);

    expect(service.create).toHaveBeenCalledWith(createDto, user.id);
    expect(service.findAll).toHaveBeenCalledWith(TournamentStatus.draft);
    expect(service.findOne).toHaveBeenCalledWith('tournament-1');
    expect(service.update).toHaveBeenCalledWith(
      'tournament-1',
      updateDto,
      user.id,
    );
    expect(service.openRegistration).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
    expect(service.startTournament).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
    expect(service.completeTournament).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
    expect(service.cancelTournament).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
  });

  it('delega la administración de equipos y grupos', () => {
    const teamDto = { name: 'Los Zetas', players: [{ userId: 'user-1' }] };
    const paymentDto = { paid: true };
    const assignments = { 'team-1': 'A', 'team-2': 'B' };

    controller.registerTeam('tournament-1', teamDto, user);
    controller.removeTeam('tournament-1', 'team-1', user);
    controller.updateTeamPayment('team-1', paymentDto, user);
    controller.getGroupStandings('tournament-1');
    controller.assignGroups('tournament-1', { assignments }, user);
    controller.generateGroupMatches('tournament-1', user);

    expect(service.registerTeam).toHaveBeenCalledWith(
      'tournament-1',
      teamDto,
      user.id,
    );
    expect(service.removeTeam).toHaveBeenCalledWith(
      'tournament-1',
      'team-1',
      user.id,
    );
    expect(service.updateTeamPayment).toHaveBeenCalledWith(
      'team-1',
      paymentDto,
      user.id,
    );
    expect(service.getGroupStandings).toHaveBeenCalledWith('tournament-1');
    expect(service.assignGroups).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
      assignments,
    );
    expect(service.generateGroupMatches).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
  });

  it('delega el bracket y los resultados de partidos', () => {
    const matchDto = {
      sets: [{ setNumber: 1, scoreA: 25, scoreB: 20 }],
    };
    const seeding = ['team-1', 'team-2'];

    controller.generateKnockoutBracket(
      'tournament-1',
      { seeding },
      user,
    );
    controller.advanceWinners('tournament-1', user);
    controller.cancelMatch('match-1', user);
    controller.updateMatchScore('match-1', matchDto, user);

    expect(service.generateKnockoutBracket).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
      seeding,
    );
    expect(service.advanceWinners).toHaveBeenCalledWith(
      'tournament-1',
      user.id,
    );
    expect(service.cancelMatch).toHaveBeenCalledWith('match-1', user.id);
    expect(service.updateMatchScore).toHaveBeenCalledWith(
      'match-1',
      matchDto,
      user.id,
    );
  });

  it('guarda las URLs de los archivos cargados', async () => {
    const rulesFile = {
      filename: 'rules.pdf',
    } as Express.Multer.File;
    const flyerFile = {
      filename: 'flyer.jpg',
    } as Express.Multer.File;

    await controller.uploadRulesPdf('tournament-1', rulesFile, user);
    await controller.uploadFlyer('tournament-1', flyerFile, user);

    expect(service.updateRulesFile).toHaveBeenCalledWith(
      'tournament-1',
      '/uploads/tournament-rules/rules.pdf',
      user.id,
    );
    expect(service.updateFlyer).toHaveBeenCalledWith(
      'tournament-1',
      '/uploads/tournament-flyers/flyer.jpg',
      user.id,
    );
  });

  it('rechaza cargas sin archivo', async () => {
    const missingFile = undefined as unknown as Express.Multer.File;

    await expect(
      controller.uploadRulesPdf('tournament-1', missingFile, user),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.uploadFlyer('tournament-1', missingFile, user),
    ).rejects.toThrow(BadRequestException);
  });
});
