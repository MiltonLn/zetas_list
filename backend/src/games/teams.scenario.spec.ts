/**
 * Scenario tests de generación de equipos — flujos stateful de extremo a
 * extremo a nivel de servicio, usando el Prisma en memoria
 * (`testing/in-memory-prisma.ts`): inscribir gente real, generar equipos,
 * regenerar, sacar jugadores, etc., y asertar sobre el estado resultante.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GameStatus, Modalidad, Position, Role } from '@prisma/client';
import { GamesService } from './games.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FinancesService } from '../finances/finances.service';
import {
  GameNotOpenException,
  UnratedPlayersException,
  NotEnoughSettersException,
} from './exceptions';
import { InMemoryPrisma, makeGameData, SeedUser } from './testing/in-memory-prisma';
import { Rng } from './teams.utils';

const ADMIN_ID = 'admin-1';

/** RNG determinista para reproducibilidad. */
function seededRng(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

interface MemberSpec {
  skillLevel?: number | null;
  positions?: Position[];
}

interface Harness {
  service: GamesService;
  prisma: InMemoryPrisma;
  members: Array<{ id: string; name: string }>;
  gameId: string;
  whatsapp: { sendToGroup: jest.Mock; sendMessage: jest.Mock };
  audit: { log: jest.Mock };
}

/**
 * Seed de admin + miembros con skills/posiciones + juego abierto.
 * Los miembros NO quedan inscritos: cada escenario decide a quién anotar.
 */
async function setup(opts: {
  members: MemberSpec[];
  maxMainSpots?: number;
  modalidad?: Modalidad;
  status?: GameStatus;
  gameDate?: Date;
}): Promise<Harness> {
  const prisma = new InMemoryPrisma();

  prisma.seedUser({ id: ADMIN_ID, name: 'Admin', username: 'admin', role: Role.admin });
  const members = opts.members.map((spec, i) => {
    const u = prisma.seedUser({
      name: `Jugador ${i + 1}`,
      username: `player${i + 1}`,
      skillLevel: spec.skillLevel,
      positions: spec.positions ?? [Position.auxiliar],
    } as SeedUser);
    return { id: u.id as string, name: u.name as string };
  });

  const game = await prisma.game.create({
    data: makeGameData({
      maxMainSpots: opts.maxMainSpots ?? 18,
      modalidad: opts.modalidad ?? Modalidad.seis_x_seis,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.gameDate ? { gameDate: opts.gameDate } : {}),
    }),
  });

  const whatsapp = { sendToGroup: jest.fn().mockResolvedValue(true), sendMessage: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const finances = {
    hasUnpaidFines: jest.fn().mockResolvedValue(false),
    createGameFines: jest.fn().mockResolvedValue(undefined),
    createGameDebts: jest.fn().mockResolvedValue(undefined),
    createGameIncome: jest.fn().mockResolvedValue(undefined),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GamesService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditService, useValue: audit },
      { provide: GameEventsService, useValue: events },
      { provide: WhatsappService, useValue: whatsapp },
      { provide: FinancesService, useValue: finances },
    ],
  }).compile();

  return { service: module.get(GamesService), prisma, members, gameId: game.id as string, whatsapp, audit };
}

/** 18 miembros calificados: los primeros `setters` son armadores. */
function ratedMembers(count: number, setters: number): MemberSpec[] {
  const skills = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
  return Array.from({ length: count }, (_, i) => ({
    skillLevel: skills[i % skills.length],
    positions: i < setters ? [Position.armador] : [Position.auxiliar],
  }));
}

async function registerAll(service: GamesService, gameId: string, members: Array<{ id: string }>) {
  for (const m of members) {
    await service.register(gameId, m.id, m.id, { silent: true });
  }
}

function mainAndWait(prisma: InMemoryPrisma, gameId: string) {
  const regs = prisma.getRegistrations(gameId);
  return {
    main: regs.filter((r) => !r.isWaitingList),
    wait: regs.filter((r) => r.isWaitingList),
  };
}

function teamsFromState(main: Array<Record<string, unknown>>): Map<number, Array<Record<string, unknown>>> {
  const teams = new Map<number, Array<Record<string, unknown>>>();
  for (const reg of main) {
    if (reg.teamNumber == null) continue;
    const n = reg.teamNumber as number;
    if (!teams.has(n)) teams.set(n, []);
    teams.get(n)!.push(reg);
  }
  return teams;
}

function teamHasSetter(team: Array<Record<string, unknown>>): boolean {
  return team.some((r) => {
    if (r.isGuest) return false;
    const user = r.user as { positions?: Position[] } | null;
    return (user?.positions ?? []).includes(Position.armador);
  });
}

function teamSkillSum(team: Array<Record<string, unknown>>): number {
  return team.reduce((sum: number, r) => {
    if (r.isGuest) return sum + 2.5;
    const user = r.user as { skillLevel?: number | null } | null;
    return sum + (user?.skillLevel ?? 0);
  }, 0);
}

function distributionSignature(main: Array<Record<string, unknown>>): string {
  return [...teamsFromState(main).entries()]
    .map(([n, team]) => `${n}:${team.map((r) => r.id).sort().join(',')}`)
    .sort()
    .join('|');
}

describe('GamesService — escenarios de equipos (stateful)', () => {
  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 1: generación feliz 6x6', () => {
    it('18 miembros calificados quedan en 3 equipos de 6 balanceados, cada uno con armador', async () => {
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(18, 3) });
      await registerAll(service, gameId, members);

      await service.generateTeams(gameId, ADMIN_ID, seededRng(42));

      const { main } = mainAndWait(prisma, gameId);
      expect(main).toHaveLength(18);
      // Todos los registros de la principal tienen equipo 1-3.
      main.forEach((r) => expect([1, 2, 3]).toContain(r.teamNumber));

      const teams = teamsFromState(main);
      expect(teams.size).toBe(3);
      for (const team of teams.values()) {
        expect(team).toHaveLength(6);
        expect(teamHasSetter(team)).toBe(true);
      }

      // Balance: diferencia entre suma máxima y mínima acotada.
      const sums = [...teams.values()].map(teamSkillSum);
      expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(5.0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 2: regeneración', () => {
    it('regenerar sobrescribe los equipos sin huérfanos y produce alternativas', async () => {
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(18, 4) });
      await registerAll(service, gameId, members);

      const signatures = new Set<string>();
      for (const seed of [1, 2, 3, 4, 5]) {
        await service.generateTeams(gameId, ADMIN_ID, seededRng(seed));

        const { main } = mainAndWait(prisma, gameId);
        // Sin huérfanos: todos con equipo válido 1-3 y cada equipo con 6.
        main.forEach((r) => expect([1, 2, 3]).toContain(r.teamNumber));
        const teams = teamsFromState(main);
        for (const team of teams.values()) {
          expect(team).toHaveLength(6);
          expect(teamHasSetter(team)).toBe(true);
        }
        signatures.add(distributionSignature(main));
      }

      // Al menos una distribución alternativa entre las 5 corridas.
      expect(signatures.size).toBeGreaterThan(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 3: miembro sin calificar bloquea la generación', () => {
    it('lanza UnratedPlayersException con el nombre y no escribe ningún teamNumber', async () => {
      const specs = ratedMembers(18, 3);
      specs[10] = { skillLevel: null, positions: [Position.auxiliar] };
      const { service, prisma, members, gameId } = await setup({ members: specs });
      await registerAll(service, gameId, members);

      await expect(service.generateTeams(gameId, ADMIN_ID, seededRng(1))).rejects.toThrow(
        UnratedPlayersException,
      );
      await expect(service.generateTeams(gameId, ADMIN_ID, seededRng(1))).rejects.toThrow('Jugador 11');

      const { main } = mainAndWait(prisma, gameId);
      main.forEach((r) => expect(r.teamNumber).toBeNull());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 4: invitados entran con skill por defecto', () => {
    it('genera con invitados distribuidos y cada equipo sigue teniendo armador', async () => {
      // 15 miembros calificados (3 armadores) + 3 invitados = 18. El juego es
      // hoy y el cutoff ya pasó, así los invitados entran directo a la principal.
      const { service, prisma, members, gameId } = await setup({
        members: ratedMembers(15, 3),
        gameDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await registerAll(service, gameId, members);
      await service.registerGuest(gameId, 'Invitado Uno', members[0].id);
      await service.registerGuest(gameId, 'Invitado Dos', members[1].id);
      await service.registerGuest(gameId, 'Invitado Tres', members[2].id);

      await service.generateTeams(gameId, ADMIN_ID, seededRng(9));

      const { main } = mainAndWait(prisma, gameId);
      expect(main).toHaveLength(18);
      const teams = teamsFromState(main);
      expect(teams.size).toBe(3);

      // Los invitados quedaron asignados a equipos.
      const guests = main.filter((r) => r.isGuest);
      expect(guests).toHaveLength(3);
      guests.forEach((g) => expect([1, 2, 3]).toContain(g.teamNumber));

      // Cada equipo tiene armador (los invitados nunca cuentan como armador).
      for (const team of teams.values()) {
        expect(teamHasSetter(team)).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 5: pocos armadores', () => {
    it('18 jugadores con solo 2 armadores para 3 equipos → error sin escritura', async () => {
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(18, 2) });
      await registerAll(service, gameId, members);

      await expect(service.generateTeams(gameId, ADMIN_ID, seededRng(1))).rejects.toThrow(
        NotEnoughSettersException,
      );

      const { main } = mainAndWait(prisma, gameId);
      main.forEach((r) => expect(r.teamNumber).toBeNull());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 6: la lista cambia después de generar', () => {
    it('el promovido de espera queda sin equipo y regenerar reasigna a todos', async () => {
      // 19 miembros: 18 a principal, 1 a espera.
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(19, 4) });
      await registerAll(service, gameId, members);

      let { main, wait } = mainAndWait(prisma, gameId);
      expect(main).toHaveLength(18);
      expect(wait).toHaveLength(1);

      await service.generateTeams(gameId, ADMIN_ID, seededRng(11));

      // Un jugador de la principal (no armador, para no romper la regeneración) se sale.
      ({ main } = mainAndWait(prisma, gameId));
      const leaving = main.find((r) => {
        const user = r.user as { positions?: Position[] };
        return !(user.positions ?? []).includes(Position.armador);
      })!;
      await service.removeRegistration(
        gameId,
        leaving.userId as string,
        leaving.userId as string,
        Role.member,
        { silent: true },
      );

      // El de espera subió a principal sin equipo; el resto conserva el suyo.
      ({ main, wait } = mainAndWait(prisma, gameId));
      expect(main).toHaveLength(18);
      expect(wait).toHaveLength(0);
      const promoted = main.find((r) => r.fromWaitList)!;
      expect(promoted.teamNumber).toBeNull();
      main
        .filter((r) => r.id !== promoted.id)
        .forEach((r) => expect([1, 2, 3]).toContain(r.teamNumber));

      // Regenerar reasigna a todos, incluido el promovido.
      await service.generateTeams(gameId, ADMIN_ID, seededRng(12));
      ({ main } = mainAndWait(prisma, gameId));
      main.forEach((r) => expect([1, 2, 3]).toContain(r.teamNumber));
      const teams = teamsFromState(main);
      for (const team of teams.values()) {
        expect(team).toHaveLength(6);
        expect(teamHasSetter(team)).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 7: modalidad 4x4', () => {
    it('12 jugadores con 3 armadores forman 3 equipos de 4', async () => {
      const { service, prisma, members, gameId } = await setup({
        members: ratedMembers(12, 3),
        maxMainSpots: 12,
        modalidad: Modalidad.cuatro_x_cuatro,
      });
      await registerAll(service, gameId, members);

      await service.generateTeams(gameId, ADMIN_ID, seededRng(21));

      const { main } = mainAndWait(prisma, gameId);
      const teams = teamsFromState(main);
      expect(teams.size).toBe(3);
      for (const team of teams.values()) {
        expect(team).toHaveLength(4);
        expect(teamHasSetter(team)).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Escenario 8: estado inválido del juego', () => {
    it('no genera equipos sobre un juego completado', async () => {
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(18, 3) });
      await registerAll(service, gameId, members);

      // El juego termina.
      await prisma.game.update({ where: { id: gameId }, data: { status: GameStatus.completed } });

      await expect(service.generateTeams(gameId, ADMIN_ID, seededRng(1))).rejects.toThrow(
        GameNotOpenException,
      );
      const { main } = mainAndWait(prisma, gameId);
      main.forEach((r) => expect(r.teamNumber).toBeNull());
    });

    it('no genera equipos sobre un juego cancelado', async () => {
      const { service, prisma, members, gameId } = await setup({ members: ratedMembers(18, 3) });
      await registerAll(service, gameId, members);
      await prisma.game.update({ where: { id: gameId }, data: { status: GameStatus.cancelled } });

      await expect(service.generateTeams(gameId, ADMIN_ID, seededRng(1))).rejects.toThrow(
        GameNotOpenException,
      );
      const { main } = mainAndWait(prisma, gameId);
      main.forEach((r) => expect(r.teamNumber).toBeNull());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('Envío a WhatsApp tras generar', () => {
    it('envía el listado con los equipos generados y audita teams_sent', async () => {
      const { service, members, gameId, whatsapp, audit } = await setup({
        members: ratedMembers(18, 3),
      });
      await registerAll(service, gameId, members);
      whatsapp.sendToGroup.mockClear();

      await service.generateTeams(gameId, ADMIN_ID, seededRng(5));
      const result = await service.sendTeamsToWhatsapp(gameId, ADMIN_ID);

      expect(result.sent).toBe(true);
      const message = whatsapp.sendToGroup.mock.calls[0][0] as string;
      expect(message).toContain('*Equipo 1:*');
      expect(message).toContain('*Equipo 2:*');
      expect(message).toContain('*Equipo 3:*');
      // Sin valores de habilidad en el mensaje.
      expect(message).not.toMatch(/\d\.\d/);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'teams_sent' }));
    });
  });
});
