import { MatchStatus, TournamentFormat } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { defaultCompetitionRules } from './rules';
import { TournamentsService } from './tournaments.service';

interface MatchState {
  id: string;
  tournamentId: string;
  phase: string;
  roundNumber: number;
  matchOrder: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  status: MatchStatus;
  sets: Array<{ setNumber: number; scoreA: number; scoreB: number }>;
}

describe('TournamentsService stateful bracket scenario', () => {
  it('completar una semifinal llena final y tercer lugar de forma idempotente', async () => {
    const rules = defaultCompetitionRules(TournamentFormat.knockout_only);
    const matches: MatchState[] = [
      {
        id: 'semi-1',
        tournamentId: 'tournament-1',
        phase: 'semifinal',
        roundNumber: 1,
        matchOrder: 0,
        teamAId: 'team-1',
        teamBId: 'team-4',
        winnerId: null,
        status: MatchStatus.scheduled,
        sets: [],
      },
      {
        id: 'semi-2',
        tournamentId: 'tournament-1',
        phase: 'semifinal',
        roundNumber: 1,
        matchOrder: 1,
        teamAId: 'team-2',
        teamBId: 'team-3',
        winnerId: 'team-2',
        status: MatchStatus.completed,
        sets: [],
      },
      {
        id: 'final',
        tournamentId: 'tournament-1',
        phase: 'final',
        roundNumber: 2,
        matchOrder: 2,
        teamAId: null,
        teamBId: null,
        winnerId: null,
        status: MatchStatus.scheduled,
        sets: [],
      },
      {
        id: 'third',
        tournamentId: 'tournament-1',
        phase: 'third_place',
        roundNumber: 2,
        matchOrder: 3,
        teamAId: null,
        teamBId: null,
        winnerId: null,
        status: MatchStatus.scheduled,
        sets: [],
      },
    ];

    const updateMatch = async (args: {
      where: { id: string };
      data: Partial<MatchState>;
    }): Promise<MatchState> => {
      const match = matches.find((item) => item.id === args.where.id);
      if (!match) throw new Error('Partido de prueba no encontrado');
      Object.assign(match, args.data);
      return match;
    };
    const transactionClient = {
      tournamentSet: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      tournamentMatch: { update: updateMatch },
    };
    const prisma = {
      tournamentMatch: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const match = matches.find((item) => item.id === where.id);
          return match
            ? {
                ...match,
                tournament: { competitionRules: rules },
                teamA: match.teamAId ? { id: match.teamAId, name: match.teamAId } : null,
                teamB: match.teamBId ? { id: match.teamBId, name: match.teamBId } : null,
                winner: match.winnerId ? { id: match.winnerId, name: match.winnerId } : null,
              }
            : null;
        }),
        update: jest.fn(updateMatch),
      },
      tournament: {
        findUnique: jest.fn().mockImplementation(async () => ({ matches })),
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return (input as (tx: typeof transactionClient) => Promise<unknown>)(
            transactionClient,
          );
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new TournamentsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    await service.updateMatchScore(
      'semi-1',
      {
        sets: [
          { setNumber: 1, scoreA: 25, scoreB: 20 },
          { setNumber: 2, scoreA: 25, scoreB: 18 },
        ],
      },
      'admin-1',
    );
    await service.advanceWinners('tournament-1', 'admin-1');

    expect(matches.find((match) => match.id === 'final')).toEqual(
      expect.objectContaining({ teamAId: 'team-1', teamBId: 'team-2' }),
    );
    expect(matches.find((match) => match.id === 'third')).toEqual(
      expect.objectContaining({ teamAId: 'team-4', teamBId: 'team-3' }),
    );
  });
});
