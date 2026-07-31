import {
  calculateGroupStandings,
  determineWinner,
  generateRoundRobinPairs,
  nextPowerOf2,
  seedKnockoutBracket,
  TeamStanding,
} from './bracket.util';

function standing(teamId: string, groupLabel: string): TeamStanding {
  return {
    teamId,
    groupLabel,
    wins: 0,
    losses: 0,
    points: 0,
    setsWon: 0,
    setsLost: 0,
    setDiff: 0,
    pointsScored: 0,
    pointsConceded: 0,
  };
}

describe('bracket utilities', () => {
  describe('determineWinner', () => {
    it('determina cualquiera de los ganadores y permite empates', () => {
      expect(
        determineWinner('a', 'b', [
          { scoreA: 25, scoreB: 20 },
          { scoreA: 25, scoreB: 18 },
        ]),
      ).toBe('a');
      expect(
        determineWinner('a', 'b', [
          { scoreA: 20, scoreB: 25 },
          { scoreA: 18, scoreB: 25 },
        ]),
      ).toBe('b');
      expect(
        determineWinner('a', 'b', [
          { scoreA: 25, scoreB: 20 },
          { scoreA: 20, scoreB: 25 },
          { scoreA: 10, scoreB: 10 },
        ]),
      ).toBeNull();
    });
  });

  describe('calculateGroupStandings', () => {
    it('acumula resultados, ignora equipos desconocidos y ordena la tabla', () => {
      const result = calculateGroupStandings(
        [
          { id: 'a', groupLabel: 'A' },
          { id: 'b', groupLabel: 'A' },
          { id: 'c', groupLabel: 'A' },
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
          {
            teamAId: 'c',
            teamBId: 'a',
            sets: [
              { scoreA: 25, scoreB: 21 },
              { scoreA: 25, scoreB: 22 },
            ],
          },
          {
            teamAId: 'missing',
            teamBId: 'a',
            sets: [{ scoreA: 25, scoreB: 0 }],
          },
        ],
      );

      expect(result.map(({ teamId }) => teamId)).toEqual(['c', 'a', 'b']);
      expect(result.find(({ teamId }) => teamId === 'a')).toEqual({
        teamId: 'a',
        groupLabel: 'A',
        wins: 1,
        losses: 1,
        points: 3,
        setsWon: 2,
        setsLost: 2,
        setDiff: 0,
        pointsScored: 93,
        pointsConceded: 88,
      });
    });

    it('desempata por diferencia de sets y luego por puntos anotados', () => {
      const result = calculateGroupStandings(
        [
          { id: 'a', groupLabel: 'A' },
          { id: 'b', groupLabel: 'A' },
          { id: 'c', groupLabel: 'A' },
          { id: 'd', groupLabel: 'A' },
        ],
        [
          {
            teamAId: 'a',
            teamBId: 'b',
            sets: [
              { scoreA: 25, scoreB: 10 },
              { scoreA: 25, scoreB: 10 },
            ],
          },
          {
            teamAId: 'c',
            teamBId: 'd',
            sets: [
              { scoreA: 26, scoreB: 24 },
              { scoreA: 20, scoreB: 25 },
              { scoreA: 15, scoreB: 12 },
            ],
          },
        ],
      );

      expect(result.map(({ teamId }) => teamId)).toEqual(['a', 'c', 'd', 'b']);
    });
  });

  it('genera todos los cruces únicos de round robin', () => {
    expect(generateRoundRobinPairs(['a', 'b', 'c'])).toEqual([
      { teamAId: 'a', teamBId: 'b' },
      { teamAId: 'a', teamBId: 'c' },
      { teamAId: 'b', teamBId: 'c' },
    ]);
    expect(generateRoundRobinPairs([])).toEqual([]);
  });

  it('calcula la siguiente potencia de dos', () => {
    expect(nextPowerOf2(1)).toBe(1);
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(8)).toBe(8);
  });

  it('siembra clasificados por grupo y completa los byes', () => {
    const groups = new Map<string, TeamStanding[]>([
      ['B', [standing('b1', 'B'), standing('b2', 'B')]],
      ['A', [standing('a1', 'A'), standing('a2', 'A')]],
    ]);

    expect(seedKnockoutBracket(groups)).toEqual(['a1', 'b1', 'a2', 'b2']);
    expect(
      seedKnockoutBracket(
        new Map([['A', [standing('a1', 'A'), standing('a2', 'A'), standing('a3', 'A')]]]),
        3,
      ),
    ).toEqual(['a1', 'a2', 'a3', null]);
  });
});
