import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TournamentStatus, TournamentFormat, Modalidad, MatchStatus } from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { defaultCompetitionRules } from './rules';

const mockPrisma = {
  tournament: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  tournamentTeam: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  tournamentPlayer: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  tournamentMatch: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  tournamentSet: {
    upsert: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };

function makeTournament(overrides: Partial<any> = {}) {
  return {
    id: 'tournament-1',
    name: 'Torneo Zetas 2026',
    format: TournamentFormat.groups_and_knockout,
    modalidad: Modalidad.seis_x_seis,
    status: TournamentStatus.draft,
    registrationOpenAt: new Date('2026-07-01'),
    startDate: new Date('2026-07-15'),
    endDate: new Date('2026-07-15'),
    pricePerTeam: 100000,
    prizeDescription: '70% primer lugar',
    maxTeams: 8,
    minPlayersPerTeam: 4,
    maxPlayersPerTeam: 8,
    minZetasMembers: 0,
    allowExternalTeams: true,
    numberOfGroups: 2,
    competitionRules: defaultCompetitionRules(TournamentFormat.groups_and_knockout),
    rules: null,
    createdById: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    teams: [],
    matches: [],
    createdBy: { id: 'admin-1', name: 'Admin' },
    ...overrides,
  };
}

function makeTeam(overrides: Partial<any> = {}) {
  return {
    id: 'team-1',
    tournamentId: 'tournament-1',
    name: 'Los Zetas',
    paid: false,
    seed: null,
    groupLabel: null,
    registeredById: 'user-1',
    createdAt: new Date(),
    players: [],
    registeredBy: { id: 'user-1', name: 'Usuario' },
    ...overrides,
  };
}

describe('TournamentsService', () => {
  let service: TournamentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('crea un torneo y registra audit log', async () => {
      const tournament = makeTournament();
      mockPrisma.tournament.create.mockResolvedValue(tournament);

      const result = await service.create(
        {
          name: 'Torneo Zetas 2026',
          format: TournamentFormat.groups_and_knockout,
          modalidad: Modalidad.seis_x_seis,
          registrationOpenAt: '2026-07-01',
          startDate: '2026-07-15',
          endDate: '2026-07-15',
          maxTeams: 8,
          numberOfGroups: 2,
        },
        'admin-1',
      );

      expect(result).toEqual(tournament);
      expect(mockPrisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Torneo Zetas 2026',
            createdById: 'admin-1',
            competitionRules: expect.objectContaining({
              version: 1,
              groupStage: expect.objectContaining({ matchFormat: 'best_of_three' }),
              knockoutStage: expect.objectContaining({ pairingStrategy: 'cross_group' }),
            }),
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tournament_created' }),
      );
    });
  });

  describe('update', () => {
    it('rechaza cambios estructurales fuera de borrador', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(
        makeTournament({ status: TournamentStatus.in_progress }),
      );

      await expect(
        service.update(
          'tournament-1',
          {
            competitionRules: {
              groupStage: { matchFormat: 'two_sets_point_difference' },
            },
          },
          'admin-1',
        ),
      ).rejects.toThrow('solo se pueden cambiar en borrador');
      expect(mockPrisma.tournament.update).not.toHaveBeenCalled();
    });

    it('permite editar campos no estructurales fuera de borrador', async () => {
      const current = makeTournament({ status: TournamentStatus.registration_open });
      mockPrisma.tournament.findUnique.mockResolvedValue(current);
      mockPrisma.tournament.update.mockResolvedValue({ ...current, name: 'Nuevo nombre' });

      await expect(
        service.update('tournament-1', { name: 'Nuevo nombre' }, 'admin-1'),
      ).resolves.toEqual(expect.objectContaining({ name: 'Nuevo nombre' }));
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('retorna el torneo si existe', async () => {
      const tournament = makeTournament();
      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);

      const result = await service.findOne('tournament-1');
      expect(result).toEqual(tournament);
    });

    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(null);
      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // openRegistration
  // ---------------------------------------------------------------------------
  describe('openRegistration', () => {
    it('abre inscripciones si el torneo está en borrador', async () => {
      const draft = makeTournament({ status: TournamentStatus.draft });
      const open = makeTournament({ status: TournamentStatus.registration_open });
      mockPrisma.tournament.findUnique.mockResolvedValue(draft);
      mockPrisma.tournament.update.mockResolvedValue(open);

      const result = await service.openRegistration('tournament-1', 'admin-1');
      expect(result.status).toBe(TournamentStatus.registration_open);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tournament_status_changed' }),
      );
    });

    it('lanza BadRequestException si el torneo ya está abierto', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(
        makeTournament({ status: TournamentStatus.registration_open }),
      );
      await expect(service.openRegistration('tournament-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // registerTeam
  // ---------------------------------------------------------------------------
  describe('registerTeam', () => {
    const openTournament = {
      id: 'tournament-1',
      status: TournamentStatus.registration_open,
      maxTeams: 8,
      minPlayersPerTeam: 4,
      maxPlayersPerTeam: 8,
      minZetasMembers: 0,
      allowExternalTeams: true,
      teams: [],
    };

    it('registra un equipo correctamente', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(openTournament);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
      const team = makeTeam();
      mockPrisma.tournamentTeam.create.mockResolvedValue(team);

      const result = await service.registerTeam(
        'tournament-1',
        {
          name: 'Los Zetas',
          players: [
            { userId: 'user-1', isCaptain: true },
            { userId: 'user-2' },
            { guestName: 'Carlos Externo' },
            { guestName: 'María Externa' },
          ],
        },
        'user-1',
      );

      expect(result).toEqual(team);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tournament_team_registered' }),
      );
    });

    it('lanza BadRequestException si las inscripciones no están abiertas', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(
        makeTournament({ status: TournamentStatus.draft }),
      );
      await expect(
        service.registerTeam('tournament-1', { name: 'Equipo', players: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el torneo está lleno', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...openTournament,
        maxTeams: 2,
        teams: [{ id: 'team-1' }, { id: 'team-2' }],
      });
      await expect(
        service.registerTeam(
          'tournament-1',
          {
            name: 'Equipo',
            players: [
              { userId: 'u1' },
              { userId: 'u2' },
              { userId: 'u3' },
              { userId: 'u4' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si hay muy pocos jugadores', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...openTournament,
        minPlayersPerTeam: 4,
      });
      await expect(
        service.registerTeam(
          'tournament-1',
          { name: 'Equipo', players: [{ userId: 'u1' }, { userId: 'u2' }] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si hay demasiados jugadores', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...openTournament,
        maxPlayersPerTeam: 4,
      });
      await expect(
        service.registerTeam(
          'tournament-1',
          {
            name: 'Equipo',
            players: [
              { userId: 'u1' },
              { userId: 'u2' },
              { userId: 'u3' },
              { userId: 'u4' },
              { guestName: 'Quinto' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no se cumplen los miembros de Zetas requeridos', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...openTournament,
        minZetasMembers: 3,
        allowExternalTeams: true,
      });
      await expect(
        service.registerTeam(
          'tournament-1',
          {
            name: 'Equipo',
            players: [
              { userId: 'u1' },
              { guestName: 'A' },
              { guestName: 'B' },
              { guestName: 'C' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el torneo no permite jugadores externos', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...openTournament,
        allowExternalTeams: false,
      });
      await expect(
        service.registerTeam(
          'tournament-1',
          {
            name: 'Equipo',
            players: [
              { userId: 'u1' },
              { userId: 'u2' },
              { userId: 'u3' },
              { guestName: 'Externo' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si un jugador no tiene userId ni guestName', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(openTournament);
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(
        service.registerTeam(
          'tournament-1',
          {
            name: 'Equipo',
            players: [
              { isCaptain: true } as any,
              { guestName: 'A' },
              { guestName: 'B' },
              { guestName: 'C' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // removeTeam
  // ---------------------------------------------------------------------------
  describe('removeTeam', () => {
    it('elimina un equipo correctamente', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(makeTournament());
      const team = makeTeam();
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(team);
      mockPrisma.tournamentTeam.delete.mockResolvedValue(team);

      await expect(
        service.removeTeam('tournament-1', 'team-1', 'admin-1'),
      ).resolves.not.toThrow();

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tournament_team_removed' }),
      );
    });

    it('lanza NotFoundException si el equipo no existe en ese torneo', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(makeTournament());
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      await expect(
        service.removeTeam('tournament-1', 'no-existe', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // updateTeamPayment
  // ---------------------------------------------------------------------------
  describe('updateTeamPayment', () => {
    it('marca el equipo como pagado', async () => {
      const team = makeTeam();
      mockPrisma.tournamentTeam.findUnique.mockResolvedValue(team);
      mockPrisma.tournamentTeam.update.mockResolvedValue({ ...team, paid: true });

      const result = await service.updateTeamPayment('team-1', { paid: true }, 'admin-1');
      expect(result.paid).toBe(true);
    });

    it('lanza NotFoundException si el equipo no existe', async () => {
      mockPrisma.tournamentTeam.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTeamPayment('no-existe', { paid: true }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('knockout bracket', () => {
    it('previsualiza liga como high-low usando los clasificados', async () => {
      const competitionRules = defaultCompetitionRules(
        TournamentFormat.league_and_knockout,
      );
      competitionRules.groupStage.qualifiersPerGroup = 4;
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...makeTournament({
          format: TournamentFormat.league_and_knockout,
          numberOfGroups: 1,
          competitionRules,
        }),
        teams: ['a', 'b', 'c', 'd'].map((id) => ({
          id,
          name: id,
          groupLabel: 'A',
          createdAt: new Date(),
        })),
        matches: [
          {
            phase: 'group',
            status: MatchStatus.completed,
            teamAId: 'a',
            teamBId: 'd',
            sets: [
              { scoreA: 25, scoreB: 20 },
              { scoreA: 25, scoreB: 18 },
            ],
          },
        ],
      });

      await expect(service.getBracketPreview('tournament-1')).resolves.toEqual(
        expect.objectContaining({
          firstRound: [
            { teamAId: 'a', teamBId: 'd' },
            { teamAId: 'b', teamBId: 'c' },
          ],
        }),
      );
    });

    it('impide generar bracket con partidos de grupo pendientes', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...makeTournament(),
        teams: [
          { id: 'a', name: 'A', groupLabel: 'A', createdAt: new Date() },
          { id: 'b', name: 'B', groupLabel: 'A', createdAt: new Date() },
        ],
        matches: [{ phase: 'group', status: MatchStatus.scheduled, sets: [] }],
      });

      await expect(service.getBracketPreview('tournament-1')).rejects.toThrow(
        'deben estar completos',
      );
    });

    it('confirma el bracket, persiste seeds y omite tercer lugar según reglas', async () => {
      const competitionRules = defaultCompetitionRules(TournamentFormat.knockout_only);
      competitionRules.knockoutStage.includeThirdPlace = false;
      const tournament = {
        ...makeTournament({
          format: TournamentFormat.knockout_only,
          numberOfGroups: null,
          competitionRules,
        }),
        teams: ['a', 'b', 'c', 'd'].map((id) => ({
          id,
          name: id,
          groupLabel: null,
          createdAt: new Date(),
        })),
        matches: [],
      };
      mockPrisma.tournament.findUnique
        .mockResolvedValueOnce(tournament)
        .mockResolvedValueOnce(tournament);
      mockPrisma.tournamentMatch.create.mockResolvedValue({});
      mockPrisma.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.tournamentTeam.updateMany.mockResolvedValue({ count: 4 });
      mockPrisma.tournamentTeam.update.mockResolvedValue({});
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.generateKnockoutBracket('tournament-1', 'admin-1');

      expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledTimes(4);
      expect(mockPrisma.tournamentMatch.create).toHaveBeenCalledTimes(3);
      expect(mockPrisma.tournamentMatch.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phase: 'third_place' }),
        }),
      );
    });

    it('completa automáticamente los byes y avanza su ganador', async () => {
      const competitionRules = defaultCompetitionRules(
        TournamentFormat.knockout_only,
      );
      competitionRules.knockoutStage.includeThirdPlace = false;
      const tournament = {
        ...makeTournament({
          format: TournamentFormat.knockout_only,
          numberOfGroups: null,
          competitionRules,
        }),
        teams: ['a', 'b', 'c'].map((id) => ({
          id,
          name: id,
          groupLabel: null,
          createdAt: new Date(),
        })),
        matches: [],
      };
      mockPrisma.tournament.findUnique.mockResolvedValueOnce(tournament);
      mockPrisma.tournamentMatch.create.mockResolvedValue({});
      mockPrisma.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.tournamentTeam.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.tournamentTeam.update.mockResolvedValue({});
      mockPrisma.$transaction.mockResolvedValue([]);
      const advanceSpy = jest
        .spyOn(service, 'advanceWinners')
        .mockResolvedValue(tournament as never);

      await service.generateKnockoutBracket('tournament-1', 'admin-1');

      expect(mockPrisma.tournamentMatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            winnerId: expect.any(String),
            status: MatchStatus.completed,
          }),
        }),
      );
      expect(advanceSpy).toHaveBeenCalledWith('tournament-1', 'admin-1');
    });
  });

  // ---------------------------------------------------------------------------
  // updateMatchScore
  // ---------------------------------------------------------------------------
  describe('updateMatchScore', () => {
    it('registra los sets y determina el ganador', async () => {
      const match = {
        id: 'match-1',
        tournamentId: 'tournament-1',
        phase: 'group',
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: null,
        status: MatchStatus.scheduled,
        sets: [],
        tournament: {
          competitionRules: defaultCompetitionRules(TournamentFormat.groups_and_knockout),
        },
      };
      const updatedMatch = {
        ...match,
        status: MatchStatus.completed,
        winnerId: 'team-a',
        sets: [
          { setNumber: 1, scoreA: 25, scoreB: 20 },
          { setNumber: 2, scoreA: 25, scoreB: 18 },
        ],
        teamA: { id: 'team-a', name: 'Equipo A' },
        teamB: { id: 'team-b', name: 'Equipo B' },
        winner: { id: 'team-a', name: 'Equipo A' },
      };

      mockPrisma.tournamentMatch.findUnique
        .mockResolvedValueOnce(match)
        .mockResolvedValueOnce(updatedMatch);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        await fn({
          tournamentSet: { upsert: jest.fn(), deleteMany: jest.fn() },
          tournamentMatch: { update: jest.fn() },
        });
      });

      const result = await service.updateMatchScore(
        'match-1',
        {
          sets: [
            { setNumber: 1, scoreA: 25, scoreB: 20 },
            { setNumber: 2, scoreA: 25, scoreB: 18 },
          ],
        },
        'admin-1',
      );

      expect(result).toEqual(updatedMatch);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tournament_match_updated' }),
      );
    });

    it('lanza NotFoundException si el partido no existe', async () => {
      mockPrisma.tournamentMatch.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMatchScore('no-existe', { sets: [{ setNumber: 1, scoreA: 25, scoreB: 20 }] }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el partido no tiene equipos', async () => {
      mockPrisma.tournamentMatch.findUnique.mockResolvedValue({
        id: 'match-1',
        teamAId: null,
        teamBId: null,
        sets: [],
      });
      await expect(
        service.updateMatchScore('match-1', { sets: [{ setNumber: 1, scoreA: 25, scoreB: 20 }] }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
