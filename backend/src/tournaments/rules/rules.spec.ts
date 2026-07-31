import { TournamentFormat } from '@prisma/client';
import {
  applyCompetitionRuleDefaults,
  buildBracketPreview,
  calculateStandings,
  defaultCompetitionRules,
  evaluateMatchResult,
  MatchResultValidationError,
  validateCompetitionRules,
} from '.';

describe('tournament competition rules', () => {
  it('aplica defaults según el formato y completa configuraciones parciales', () => {
    const groups = defaultCompetitionRules(TournamentFormat.groups_and_knockout);
    const league = applyCompetitionRuleDefaults(
      TournamentFormat.league_and_knockout,
      { groupStage: { matchFormat: 'two_sets_point_difference' } },
    );

    expect(groups.knockoutStage.pairingStrategy).toBe('cross_group');
    expect(league.knockoutStage.pairingStrategy).toBe('high_low');
    expect(league.groupStage).toEqual(
      expect.objectContaining({
        matchFormat: 'two_sets_point_difference',
        qualifiersPerGroup: 2,
        regularSetPoints: 25,
      }),
    );
    expect(validateCompetitionRules(league)).toBe(true);
    expect(validateCompetitionRules({ ...league, version: 2 })).toBe(false);
  });

  describe('resultados de partidos', () => {
    it('otorga 3/0 para 2-0 y 2/1 para un split decidido por puntos', () => {
      const rules = defaultCompetitionRules(TournamentFormat.groups_and_knockout);
      rules.groupStage.matchFormat = 'two_sets_point_difference';

      expect(
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 20 },
            { scoreA: 25, scoreB: 18 },
          ],
          'group',
          rules,
        ),
      ).toEqual(expect.objectContaining({ winnerId: 'a', tablePointsA: 3, tablePointsB: 0 }));
      expect(
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 15 },
            { scoreA: 23, scoreB: 25 },
          ],
          'group',
          rules,
        ),
      ).toEqual(expect.objectContaining({ winnerId: 'a', tablePointsA: 2, tablePointsB: 1 }));
    });

    it('exige tercer set en empate agregado exacto y conserva puntos 2/1', () => {
      const rules = defaultCompetitionRules(TournamentFormat.groups_and_knockout);
      rules.groupStage.matchFormat = 'two_sets_point_difference';
      const tiedSets = [
        { scoreA: 25, scoreB: 20 },
        { scoreA: 20, scoreB: 25 },
      ];

      expect(() => evaluateMatchResult('a', 'b', tiedSets, 'group', rules)).toThrow(
        'requiere un tercer set',
      );
      expect(
        evaluateMatchResult(
          'a',
          'b',
          [...tiedSets, { scoreA: 13, scoreB: 15 }],
          'group',
          rules,
        ),
      ).toEqual(expect.objectContaining({ winnerId: 'b', tablePointsA: 1, tablePointsB: 2 }));
    });

    it('en eliminatoria nunca usa puntos agregados y rechaza resultados incompletos o extra', () => {
      const rules = defaultCompetitionRules(TournamentFormat.knockout_only);
      expect(() =>
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 10 },
            { scoreA: 23, scoreB: 25 },
          ],
          'knockout',
          rules,
        ),
      ).toThrow(MatchResultValidationError);
      expect(() =>
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 10 },
            { scoreA: 25, scoreB: 10 },
            { scoreA: 15, scoreB: 10 },
          ],
          'knockout',
          rules,
        ),
      ).toThrow('sets adicionales');
      expect(() =>
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 10 },
            { scoreA: 25, scoreB: 10 },
            { scoreA: 10, scoreB: 15 },
          ],
          'knockout',
          rules,
        ),
      ).toThrow('sets adicionales');
    });

    it('valida el puntaje objetivo y la diferencia mínima', () => {
      const rules = defaultCompetitionRules(TournamentFormat.knockout_only);
      expect(() =>
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 24 },
            { scoreA: 25, scoreB: 20 },
          ],
          'knockout',
          rules,
        ),
      ).toThrow('diferencia de dos');
    });

    it('permite cerrar el set por un punto cuando no hay alargue', () => {
      const baseRules = defaultCompetitionRules(
        TournamentFormat.knockout_only,
      );
      const rules = {
        ...baseRules,
        knockoutStage: {
          ...baseRules.knockoutStage,
          winByTwo: false,
        },
      };

      expect(
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 25, scoreB: 24 },
            { scoreA: 25, scoreB: 20 },
          ],
          'knockout',
          rules,
        ),
      ).toEqual(expect.objectContaining({ winnerId: 'a' }));
      expect(() =>
        evaluateMatchResult(
          'a',
          'b',
          [
            { scoreA: 26, scoreB: 24 },
            { scoreA: 25, scoreB: 20 },
          ],
          'knockout',
          rules,
        ),
      ).toThrow('sin alargue');
    });
  });

  it('calcula estadísticas, clasificación y head-to-head determinista', () => {
    const rules = defaultCompetitionRules(TournamentFormat.groups_and_knockout);
    rules.groupStage.tiebreakers = ['headToHead'];
    rules.groupStage.qualifiersPerGroup = 1;
    const standings = calculateStandings(
      [
        { id: 'a', groupLabel: 'A' },
        { id: 'b', groupLabel: 'A' },
      ],
      [
        {
          teamAId: 'a',
          teamBId: 'b',
          sets: [
            { scoreA: 25, scoreB: 20 },
            { scoreA: 25, scoreB: 18 },
          ],
        },
      ],
      rules,
    );

    expect(standings[0]).toEqual(
      expect.objectContaining({
        teamId: 'a',
        position: 1,
        wins: 1,
        points: 3,
        setsWon: 2,
        pointDifference: 12,
        qualified: true,
      }),
    );
    expect(standings[1].qualified).toBe(false);
  });

  it('crea cruces high-low y cross-group con tercer lugar configurable', () => {
    const highLowRules = defaultCompetitionRules(TournamentFormat.league_and_knockout);
    expect(buildBracketPreview(['1', '2', '3', '4'], highLowRules).firstRound).toEqual([
      { teamAId: '1', teamBId: '4' },
      { teamAId: '2', teamBId: '3' },
    ]);

    const crossRules = defaultCompetitionRules(TournamentFormat.groups_and_knockout);
    const standings = ['a1', 'a2', 'b1', 'b2'].map((teamId, index) => ({
      teamId,
      groupLabel: teamId[0].toUpperCase(),
      position: (index % 2) + 1,
      wins: 0,
      losses: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
      setDifference: 0,
      pointsScored: 0,
      pointsConceded: 0,
      pointDifference: 0,
      qualified: true,
    }));
    expect(buildBracketPreview(['a1', 'b1', 'a2', 'b2'], crossRules, standings).firstRound).toEqual([
      { teamAId: 'a1', teamBId: 'b2' },
      { teamAId: 'a2', teamBId: 'b1' },
    ]);
  });
});
