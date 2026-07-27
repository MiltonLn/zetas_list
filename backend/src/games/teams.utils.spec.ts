import { Modalidad, Position } from '@prisma/client';
import {
  generateBalancedTeams,
  DEFAULT_GUEST_SKILL,
  NUM_TEAMS,
  TEAM_SIZE,
  TeamPlayer,
  Rng,
} from './teams.utils';
import {
  UnratedPlayersException,
  NotEnoughPlayersException,
  NotEnoughSettersException,
} from './exceptions';

/** Deterministic LCG so tests are reproducible. */
function seededRng(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

let idCounter = 0;
function makePlayer(overrides: Partial<TeamPlayer> = {}): TeamPlayer {
  idCounter += 1;
  return {
    registrationId: `reg-${idCounter}`,
    displayName: `Jugador ${idCounter}`,
    isGuest: false,
    skillLevel: 3.0,
    positions: [Position.auxiliar],
    ...overrides,
  };
}

/** N members: `setters` of them armadores, skills cycling through a range. */
function makeRoster(count: number, setters: number): TeamPlayer[] {
  const skills = [1.0, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
  return Array.from({ length: count }, (_, i) =>
    makePlayer({
      skillLevel: skills[i % skills.length],
      positions: i < setters ? [Position.armador] : [Position.auxiliar],
    }),
  );
}

beforeEach(() => {
  idCounter = 0;
});

describe('generateBalancedTeams', () => {
  describe('estructura de equipos', () => {
    it('6x6 con 18 jugadores produce 3 equipos de 6', () => {
      const teams = generateBalancedTeams(makeRoster(18, 3), Modalidad.seis_x_seis, seededRng(1));
      expect(teams).toHaveLength(3);
      teams.forEach((t) => expect(t.players).toHaveLength(6));
    });

    it('4x4 con 12 jugadores produce 3 equipos de 4', () => {
      const teams = generateBalancedTeams(makeRoster(12, 3), Modalidad.cuatro_x_cuatro, seededRng(1));
      expect(teams).toHaveLength(3);
      teams.forEach((t) => expect(t.players).toHaveLength(4));
    });

    it('siempre genera exactamente NUM_TEAMS equipos independientemente del tamaño del roster', () => {
      // 15 jugadores (mínimo para 6x6): 3 equipos de 5
      const teams15 = generateBalancedTeams(makeRoster(15, 3), Modalidad.seis_x_seis, seededRng(1));
      expect(teams15).toHaveLength(NUM_TEAMS);

      // 20 jugadores: 3 equipos (sobrantes repartidos)
      const teams20 = generateBalancedTeams(makeRoster(20, 3), Modalidad.seis_x_seis, seededRng(1));
      expect(teams20).toHaveLength(NUM_TEAMS);
    });

    it('reparte sobrantes cuando la lista no es divisible por teamSize (16 jugadores 6x6 → 3 equipos)', () => {
      const teams = generateBalancedTeams(makeRoster(16, 3), Modalidad.seis_x_seis, seededRng(1));
      expect(teams).toHaveLength(NUM_TEAMS);
      const total = teams.reduce((s, t) => s + t.players.length, 0);
      expect(total).toBe(16);
    });

    it('cada jugador queda en exactamente un equipo', () => {
      const roster = makeRoster(18, 3);
      const teams = generateBalancedTeams(roster, Modalidad.seis_x_seis, seededRng(7));
      const assigned = teams.flatMap((t) => t.players.map((p) => p.registrationId));
      expect(assigned.sort()).toEqual(roster.map((p) => p.registrationId).sort());
    });
  });

  describe('restricción de armadores', () => {
    it('cada equipo tiene al menos un armador', () => {
      for (let seed = 1; seed <= 10; seed++) {
        const teams = generateBalancedTeams(makeRoster(18, 4), Modalidad.seis_x_seis, seededRng(seed));
        teams.forEach((t) => {
          expect(t.players.some((p) => !p.isGuest && p.positions.includes(Position.armador))).toBe(true);
        });
      }
    });

    it('jugador multi-posición cuenta como armador', () => {
      const roster = makeRoster(12, 2);
      // Tercer armador vía multi-posición: central + armador
      roster[5] = makePlayer({ positions: [Position.central, Position.armador], skillLevel: 3.0 });
      const teams = generateBalancedTeams(roster, Modalidad.cuatro_x_cuatro, seededRng(3));
      expect(teams).toHaveLength(3);
      teams.forEach((t) => {
        expect(t.players.some((p) => p.positions.includes(Position.armador))).toBe(true);
      });
    });

    it('lanza NotEnoughSettersException si faltan armadores', () => {
      expect(() => generateBalancedTeams(makeRoster(18, 2), Modalidad.seis_x_seis, seededRng(1)))
        .toThrow(NotEnoughSettersException);
    });

    it('un invitado con nombre no cuenta como armador', () => {
      const roster = makeRoster(12, 2);
      roster.push(
        makePlayer({ isGuest: true, skillLevel: null, positions: [] }),
      );
      // 13 jugadores 4x4 → 3 equipos, solo 2 armadores → error
      expect(() => generateBalancedTeams(roster, Modalidad.cuatro_x_cuatro, seededRng(1)))
        .toThrow(NotEnoughSettersException);
    });
  });

  describe('validaciones', () => {
    it('lanza UnratedPlayersException con los nombres de los miembros sin calificar', () => {
      const roster = makeRoster(18, 3);
      roster[4] = makePlayer({ displayName: 'Pepe Sin Nota', skillLevel: null });
      roster[9] = makePlayer({ displayName: 'Ana Sin Nota', skillLevel: null });
      expect(() => generateBalancedTeams(roster, Modalidad.seis_x_seis, seededRng(1)))
        .toThrow(UnratedPlayersException);
      expect(() => generateBalancedTeams(roster, Modalidad.seis_x_seis, seededRng(1)))
        .toThrow(/Pepe Sin Nota, Ana Sin Nota/);
    });

    it('los invitados sin calificación NO bloquean la generación', () => {
      const roster = makeRoster(15, 3);
      for (let i = 0; i < 3; i++) {
        roster.push(makePlayer({ isGuest: true, skillLevel: null, positions: [] }));
      }
      expect(() => generateBalancedTeams(roster, Modalidad.seis_x_seis, seededRng(1))).not.toThrow();
    });

    it('lanza NotEnoughPlayersException si hay menos del mínimo para 3 equipos', () => {
      const min6x6 = NUM_TEAMS * (TEAM_SIZE[Modalidad.seis_x_seis] - 1); // 15
      // 14 jugadores en 6x6 → error
      expect(() => generateBalancedTeams(makeRoster(min6x6 - 1, 3), Modalidad.seis_x_seis, seededRng(1)))
        .toThrow(NotEnoughPlayersException);
      // 15 jugadores en 6x6 → OK
      expect(() => generateBalancedTeams(makeRoster(min6x6, 3), Modalidad.seis_x_seis, seededRng(1)))
        .not.toThrow();
    });

    it('mínimo para 4x4 es NUM_TEAMS * (teamSize - 1) = 9', () => {
      const min4x4 = NUM_TEAMS * (TEAM_SIZE[Modalidad.cuatro_x_cuatro] - 1); // 9
      expect(() => generateBalancedTeams(makeRoster(min4x4 - 1, 3), Modalidad.cuatro_x_cuatro, seededRng(1)))
        .toThrow(NotEnoughPlayersException);
      expect(() => generateBalancedTeams(makeRoster(min4x4, 3), Modalidad.cuatro_x_cuatro, seededRng(1)))
        .not.toThrow();
    });
  });

  describe('balance de habilidad', () => {
    it('la diferencia de skill entre equipos queda acotada', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const teams = generateBalancedTeams(makeRoster(18, 3), Modalidad.seis_x_seis, seededRng(seed));
        const sums = teams.map((t) => t.skillSum);
        const spread = Math.max(...sums) - Math.min(...sums);
        // Greedy fill sobre 6 jugadores por equipo: el spread nunca debería
        // superar el skill máximo de un jugador individual.
        expect(spread).toBeLessThanOrEqual(5.0);
      }
    });

    it('los invitados suman DEFAULT_GUEST_SKILL al equipo', () => {
      const roster = makeRoster(11, 3);
      roster.push(makePlayer({ isGuest: true, skillLevel: null, positions: [] }));
      const teams = generateBalancedTeams(roster, Modalidad.cuatro_x_cuatro, seededRng(2));
      const totalSkill = teams.reduce((s, t) => s + t.skillSum, 0);
      const expected = roster.reduce(
        (s, p) => s + (p.isGuest ? DEFAULT_GUEST_SKILL : (p.skillLevel as number)),
        0,
      );
      expect(totalSkill).toBeCloseTo(expected);
    });
  });

  describe('regeneración', () => {
    it('semillas distintas producen al menos una distribución alternativa', () => {
      const roster = makeRoster(18, 4);
      const signature = (teams: ReturnType<typeof generateBalancedTeams>) =>
        teams.map((t) => t.players.map((p) => p.registrationId).sort().join(',')).join('|');

      const signatures = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) {
        signatures.add(signature(generateBalancedTeams(roster, Modalidad.seis_x_seis, seededRng(seed))));
      }
      expect(signatures.size).toBeGreaterThan(1);
    });
  });
});
