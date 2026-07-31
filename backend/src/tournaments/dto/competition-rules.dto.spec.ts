import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentDto } from './create-tournament.dto';

function basePayload(): Record<string, unknown> {
  return {
    name: 'Torneo Zetas',
    format: 'league_and_knockout',
    modalidad: 'seis_x_seis',
    registrationOpenAt: '2026-08-01T12:00:00.000Z',
    startDate: '2026-08-02T12:00:00.000Z',
    endDate: '2026-08-03T12:00:00.000Z',
    maxTeams: 4,
  };
}

describe('CompetitionRulesDto', () => {
  it('acepta una configuración parcial anidada válida', async () => {
    const dto = plainToInstance(CreateTournamentDto, {
      ...basePayload(),
      competitionRules: {
        groupStage: {
          matchFormat: 'two_sets_point_difference',
          standingsPoints: { splitWin: 2 },
          winByTwo: false,
        },
        knockoutStage: { includeThirdPlace: false, winByTwo: false },
      },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza formatos, desempates y puntajes anidados inválidos', async () => {
    const dto = plainToInstance(CreateTournamentDto, {
      ...basePayload(),
      competitionRules: {
        groupStage: {
          matchFormat: 'aggregate',
          tiebreakers: ['wins', 'wins'],
          standingsPoints: { straightLoss: -1 },
        },
        knockoutStage: { pairingStrategy: 'random' },
      },
    });

    const errors = await validate(dto);
    expect(errors.find((error) => error.property === 'competitionRules')).toBeDefined();
  });
});
