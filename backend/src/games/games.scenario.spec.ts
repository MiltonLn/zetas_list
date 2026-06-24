/**
 * Scenario tests — simulan flujos reales de extremo a extremo usando un Prisma
 * en memoria con estado (ver `testing/in-memory-prisma.ts`).
 *
 * A diferencia de `games.service.spec.ts` (cada test mockea un solo paso), aquí
 * el estado evoluciona entre operaciones: inscribir gente, llenar la lista,
 * mandar a espera, pasar el cutoff, subir/bajar jugadores, timeouts, etc.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GameStatus, Role } from '@prisma/client';
import { GamesService } from './games.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FinancesService } from '../finances/finances.service';
import { GameNotOpenException, NoPendingConfirmationException } from './exceptions';
import { InMemoryPrisma, makeGameData } from './testing/in-memory-prisma';

const ADMIN_ID = 'admin-1';

interface Harness {
  service: GamesService;
  prisma: InMemoryPrisma;
  members: Array<{ id: string; name: string; username: string }>;
  gameId: string;
  whatsapp: { sendToGroup: jest.Mock; sendMessage: jest.Mock };
  audit: { log: jest.Mock };
  finances: {
    hasUnpaidFines: jest.Mock;
    createGameFines: jest.Mock;
    createGameDebts: jest.Mock;
    createGameIncome: jest.Mock;
  };
}

async function setup(opts: { members: number; maxMainSpots?: number; gameDate?: Date }): Promise<Harness> {
  const prisma = new InMemoryPrisma();

  prisma.seedUser({ id: ADMIN_ID, name: 'Admin', username: 'admin', role: Role.admin });
  const members = Array.from({ length: opts.members }, (_, i) =>
    prisma.seedUser({ name: `Jugador ${i + 1}`, username: `player${i + 1}` }),
  ).map((u) => ({ id: u.id as string, name: u.name as string, username: u.username as string }));

  const game = await prisma.game.create({
    data: makeGameData({
      maxMainSpots: opts.maxMainSpots ?? 4,
      ...(opts.gameDate ? { gameDate: opts.gameDate } : {}),
    }),
  });

  const whatsapp = { sendToGroup: jest.fn().mockResolvedValue(undefined), sendMessage: jest.fn().mockResolvedValue(undefined) };
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

  return { service: module.get(GamesService), prisma, members, gameId: game.id as string, whatsapp, audit, finances };
}

/** Helpers de aserción sobre el estado actual de las listas. */
function lists(prisma: InMemoryPrisma, gameId: string) {
  const regs = prisma.getRegistrations(gameId);
  const main = regs.filter((r) => !r.isWaitingList).sort((a, b) => (a.position as number) - (b.position as number));
  const wait = regs.filter((r) => r.isWaitingList).sort((a, b) => (a.position as number) - (b.position as number));
  return { main, wait };
}

/** Devuelve las posiciones (ordenadas) de una lista. */
function positionsOf(regs: Array<Record<string, unknown>>): number[] {
  return regs.map((r) => r.position as number).sort((a, b) => a - b);
}

/** true si las posiciones son únicas (sin duplicados). */
function hasUniquePositions(regs: Array<Record<string, unknown>>): boolean {
  const pos = positionsOf(regs);
  return new Set(pos).size === pos.length;
}

/** true si las posiciones son contiguas empezando en 1: [1, 2, ..., n]. */
function isContiguousFromOne(regs: Array<Record<string, unknown>>): boolean {
  const pos = positionsOf(regs);
  return pos.every((p, i) => p === i + 1);
}

describe('GamesService — escenarios reales (stateful)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 1: llenar lista, desbordar a espera, salir y auto-promover', () => {
    it('simula el flujo completo', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      // 6 personas se anotan (self-register). Las primeras 4 a principal, 2 a espera.
      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      let { main, wait } = lists(prisma, gameId);
      expect(main).toHaveLength(4);
      expect(wait).toHaveLength(2);
      expect(main.map((r) => r.position)).toEqual([1, 2, 3, 4]);
      expect(wait.map((r) => r.position)).toEqual([1, 2]);
      // El juego registró que la lista principal se llenó.
      expect(prisma.getGame(gameId)?.mainListHasBeenFull).toBe(true);

      // El jugador en la posición 2 de la principal se sale.
      const leaving = main.find((r) => r.position === 2)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      // La principal se recompacta y auto-promueve al primero de la espera.
      ({ main, wait } = lists(prisma, gameId));
      expect(main).toHaveLength(4);
      expect(wait).toHaveLength(1);

      // El promovido proviene de la lista de espera y queda pendiente de confirmación.
      const promoted = main.find((r) => r.fromWaitList);
      expect(promoted).toBeDefined();
      expect(promoted?.pendingConfirmation).toBe(true);
      expect(promoted?.isWaitingList).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 2: bajar y subir jugadores manualmente (admin)', () => {
    it('demote mueve a espera y promote regresa a principal', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 5, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      let { main, wait } = lists(prisma, gameId);
      expect(main).toHaveLength(4);
      expect(wait).toHaveLength(1);

      // Admin baja al jugador de la posición 1 de la principal.
      const top = main.find((r) => r.position === 1)!;
      await service.demote(gameId, top.id as string, ADMIN_ID);

      ({ main, wait } = lists(prisma, gameId));
      expect(main).toHaveLength(3);
      expect(wait).toHaveLength(2);
      // El jugador bajado quedó en la lista de espera.
      expect(wait.some((r) => r.id === top.id && r.isWaitingList)).toBe(true);
      // La principal se recompactó a posiciones 1..3.
      expect(main.map((r) => r.position)).toEqual([1, 2, 3]);

      // Admin sube de nuevo a alguien de la espera a la principal.
      const toPromote = wait.find((r) => r.id !== top.id)!;
      await service.promote(gameId, toPromote.id as string, ADMIN_ID);

      ({ main, wait } = lists(prisma, gameId));
      expect(main).toHaveLength(4);
      expect(wait).toHaveLength(1);
      const nowMain = main.find((r) => r.id === toPromote.id);
      expect(nowMain?.isWaitingList).toBe(false);
      expect(nowMain?.fromWaitList).toBe(true);
      // promote manual no exige confirmación.
      expect(nowMain?.pendingConfirmation).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 3: el cutoff cambia la elegibilidad de los invitados', () => {
    it('antes del cutoff el invitado espera; después puede ser auto-promovido', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 5, maxMainSpots: 4 });

      // 4 miembros llenan la principal.
      for (const m of members.slice(0, 4)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Un invitado se anota ANTES del cutoff -> siempre va a espera.
      // Lo invita members[0], que permanecerá en la lista (para que el invitado
      // no se elimine como huérfano cuando salga otro jugador).
      await service.registerGuest(gameId, 'Carlos Invitado', members[0].id, { silent: true });
      // Un miembro más se anota -> también a espera (principal llena).
      await service.register(gameId, members[4].id, members[4].id, { silent: true });

      let { main, wait } = lists(prisma, gameId);
      expect(main).toHaveLength(4);
      expect(wait).toHaveLength(2);
      const guest = wait.find((r) => r.isGuest)!;
      expect(guest.position).toBe(1); // el invitado fue el primero en la espera

      // ── Pasa el cutoff: simulamos cambiando la fecha del juego al pasado ──
      const g = prisma.getGame(gameId)!;
      g.gameDate = new Date('2020-01-01');
      expect(service.isBeforeCutoff(g.guestCutoffTime as string, g.gameDate as Date)).toBe(false);

      // Un jugador de la principal se sale (posición 2, que no invitó a nadie) ->
      // auto-promote. Tras el cutoff los invitados SÍ son elegibles, así que el
      // invitado (posición 1 de la espera) es promovido.
      const leaving = main.find((r) => r.position === 2)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      ({ main, wait } = lists(prisma, gameId));
      const promotedGuest = main.find((r) => r.isGuest);
      expect(promotedGuest).toBeDefined();
      expect(promotedGuest?.isWaitingList).toBe(false);
      expect(promotedGuest?.fromWaitList).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 4: timeout de confirmación devuelve a espera y promueve al siguiente', () => {
    it('el promovido que no confirma vuelve a espera (declined) y el siguiente sube', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Sale alguien de la principal -> auto-promueve al primer waiter (queda pending).
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(pending).toBeDefined();

      // No confirma a tiempo -> timeout.
      await service.handleConfirmationTimeout(pending.id as string);

      const after = prisma.getRegistrations(gameId);
      const declined = after.find((r) => r.id === pending.id)!;
      // Volvió a la lista de espera marcado como rechazado.
      expect(declined.isWaitingList).toBe(true);
      expect(declined.confirmationDeclined).toBe(true);

      // Y se promovió al siguiente waiter no rechazado (queda pending).
      const newPending = after.find((r) => !r.isWaitingList && r.pendingConfirmation && r.id !== pending.id);
      expect(newPending).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 5: completar el juego y generar reporte', () => {
    it('marca asistencia, completa y produce un reporte coherente', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 4, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // 3 asistieron y pagaron; 1 no asistió.
      const main = lists(prisma, gameId).main;
      for (const r of main.slice(0, 3)) {
        await service.updateRegistration(r.id as string, { attended: true, paid: true }, ADMIN_ID, gameId);
      }

      const { game, report } = await service.complete(gameId, ADMIN_ID, { silent: true });
      expect(game.status).toBe(GameStatus.completed);
      expect(report).toContain('Asistentes:* 3/4');
      // El que no asistió en lista principal aparece como multado.
      expect(report).toContain('Multados');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario A: proxy se registra directo (sin confirmación)', () => {
    it('un miembro anota a otro y queda en principal sin confirmación pendiente', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 2, maxMainSpots: 4 });
      const [inviter, invited] = members;

      // El invitador se anota a sí mismo primero (requisito para anotar proxies).
      await service.register(gameId, inviter.id, inviter.id, { silent: true });
      // Anota a otro miembro como proxy: ya no hay flujo de confirmación de proxy.
      await service.register(gameId, invited.id, inviter.id, { silent: true });

      const invitedReg = prisma.getRegistrations(gameId).find((r) => r.userId === invited.id)!;
      expect(invitedReg.isWaitingList).toBe(false);
      expect(invitedReg.pendingConfirmation).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario B: cascada de timeouts hasta que nadie confirma', () => {
    it('A→B→C no confirman y el cupo queda libre', async () => {
      const { service, prisma, members, gameId, whatsapp } = await setup({ members: 7, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }
      // 4 principal + 3 espera.
      expect(lists(prisma, gameId).wait).toHaveLength(3);
      const waiterIds = lists(prisma, gameId).wait.map((r) => r.userId as string);

      // Se libera un cupo -> auto-promueve al primer waiter (pendiente).
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      // Timeout en cadena: cada promovido no confirma y se promueve al siguiente.
      for (let i = 0; i < 3; i++) {
        const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation);
        if (!pending) break;
        await service.handleConfirmationTimeout(pending.id as string);
      }

      // Los 3 waiters originales quedaron rechazados en lista de espera.
      const regs = prisma.getRegistrations(gameId);
      for (const id of waiterIds) {
        const r = regs.find((x) => x.userId === id)!;
        expect(r.isWaitingList).toBe(true);
        expect(r.confirmationDeclined).toBe(true);
      }
      // El cupo quedó libre (3/4) y se anunció que nadie confirmó.
      expect(lists(prisma, gameId).main).toHaveLength(3);
      expect(whatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('Nadie en lista de espera confirmó'),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario C: retryFromWaitingList', () => {
    it('un declined reintenta y es promovido si hay cupo', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 5, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }
      const waiterId = lists(prisma, gameId).wait[0].userId as string;

      // Se libera un cupo -> el waiter es promovido (pendiente)...
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      // ...pero no confirma -> vuelve a espera como declined y el cupo queda libre.
      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      await service.handleConfirmationTimeout(pending.id as string);

      let waiter = prisma.getRegistrations(gameId).find((r) => r.userId === waiterId)!;
      expect(waiter.isWaitingList).toBe(true);
      expect(waiter.confirmationDeclined).toBe(true);
      expect(lists(prisma, gameId).main).toHaveLength(3);

      // Reintenta desde la lista de espera -> promovido.
      const res = await service.retryFromWaitingList(gameId, waiterId);
      expect(res.promoted).toBe(true);

      waiter = prisma.getRegistrations(gameId).find((r) => r.userId === waiterId)!;
      expect(waiter.isWaitingList).toBe(false);
      expect(waiter.fromWaitList).toBe(true);
      expect(waiter.confirmationDeclined).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario D: re-registro de un declined (reactivación vía register)', () => {
    it('al volver a anotarse, el declined se reactiva y sube si hay cupo', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 5, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }
      const waiterId = lists(prisma, gameId).wait[0].userId as string;

      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });
      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      await service.handleConfirmationTimeout(pending.id as string);

      // Hay cupo libre (3/4) y el waiter quedó declined. Se vuelve a anotar.
      await service.register(gameId, waiterId, waiterId, { silent: true });

      const waiter = prisma.getRegistrations(gameId).find((r) => r.userId === waiterId)!;
      expect(waiter.isWaitingList).toBe(false);
      expect(waiter.confirmationDeclined).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario E: todos declinaron -> cupo libre -> nuevo entra directo a principal', () => {
    it('con la espera vacía de elegibles, la nueva inscripción no va a espera', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 7, maxMainSpots: 4 });

      // 6 se anotan: 4 principal + 2 espera. El 7º lo dejamos para el final.
      for (const m of members.slice(0, 6)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Liberamos un cupo y dejamos que ambos waiters declinen por timeout.
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });
      for (let i = 0; i < 2; i++) {
        const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation);
        if (!pending) break;
        await service.handleConfirmationTimeout(pending.id as string);
      }

      // Cupo libre (3/4) y todos los de espera están declined.
      expect(lists(prisma, gameId).main).toHaveLength(3);
      expect(lists(prisma, gameId).wait.every((r) => r.confirmationDeclined)).toBe(true);

      // Un jugador nuevo se anota -> entra DIRECTO a principal (no a espera).
      const newcomer = members[6];
      await service.register(gameId, newcomer.id, newcomer.id, { silent: true });

      const reg = prisma.getRegistrations(gameId).find((r) => r.userId === newcomer.id)!;
      expect(reg.isWaitingList).toBe(false);
      expect(lists(prisma, gameId).main).toHaveLength(4);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario F: invitados huérfanos al salir el invitador', () => {
    it('elimina los invitados del que se va y recompacta las listas', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 3, maxMainSpots: 6 });
      const [m1, m2, m3] = members;

      await service.register(gameId, m1.id, m1.id, { silent: true });
      await service.register(gameId, m2.id, m2.id, { silent: true });
      await service.register(gameId, m3.id, m3.id, { silent: true });

      // Antes del cutoff, los invitados van a la lista de espera.
      await service.registerGuest(gameId, 'Guest A', m1.id, { silent: true }); // huérfano si m1 se va
      await service.registerGuest(gameId, 'Guest B', m1.id, { silent: true }); // huérfano si m1 se va
      await service.registerGuest(gameId, 'Guest C', m2.id, { silent: true }); // permanece

      expect(lists(prisma, gameId).wait).toHaveLength(3);

      // m1 se sale -> sus 2 invitados también deben desaparecer.
      await service.removeRegistration(gameId, m1.id, m1.id, Role.member, { silent: true });

      const wait = lists(prisma, gameId).wait;
      const guestNames = wait.map((r) => r.guestName);
      expect(guestNames).not.toContain('Guest A');
      expect(guestNames).not.toContain('Guest B');
      expect(guestNames).toContain('Guest C');
      // La lista de espera quedó con un solo invitado y recompactada.
      expect(wait).toHaveLength(1);
      expect(isContiguousFromOne(wait)).toBe(true);
      // La principal se recompactó tras la salida de m1.
      expect(isContiguousFromOne(lists(prisma, gameId).main)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario G: invariantes de posiciones tras una secuencia larga', () => {
    it('sin duplicados por lista y principal contigua desde 1', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Secuencia: bajar uno, subir uno, sacar uno, reordenar.
      const main0 = lists(prisma, gameId).main;
      await service.demote(gameId, main0.find((r) => r.position === 2)!.id as string, ADMIN_ID);

      const wait1 = lists(prisma, gameId).wait;
      await service.promote(gameId, wait1[0].id as string, ADMIN_ID);

      const main2 = lists(prisma, gameId).main;
      const victim = main2.find((r) => !r.pendingConfirmation)!;
      await service.removeRegistration(gameId, victim.userId as string, victim.userId as string, Role.member, { silent: true });

      const { main, wait } = lists(prisma, gameId);
      const reorderDto = {
        mainList: [...main].reverse().map((r) => r.id as string),
        waitList: wait.map((r) => r.id as string),
      };
      await service.reorder(gameId, reorderDto, ADMIN_ID);

      const final = lists(prisma, gameId);
      // Invariante 1: posiciones únicas en cada lista (refleja el UNIQUE de la DB).
      expect(hasUniquePositions(final.main)).toBe(true);
      expect(hasUniquePositions(final.wait)).toBe(true);
      // Invariante 2: la lista principal es contigua desde 1.
      expect(isContiguousFromOne(final.main)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario H: cancelación bloquea inscripciones (con rollback)', () => {
    it('tras cancelar, register lanza y el estado no se corrompe', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 3, maxMainSpots: 4 });

      await service.register(gameId, members[0].id, members[0].id, { silent: true });
      await service.register(gameId, members[1].id, members[1].id, { silent: true });

      await service.cancel(gameId, { reason: 'Lluvia' }, ADMIN_ID);
      expect(prisma.getGame(gameId)?.status).toBe(GameStatus.cancelled);

      // Intentar anotar a un tercero falla...
      await expect(
        service.register(gameId, members[2].id, members[2].id, { silent: true }),
      ).rejects.toThrow(GameNotOpenException);

      // ...y no dejó registro parcial (rollback).
      expect(prisma.getRegistrations(gameId)).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario I: complete() dispara los efectos de finanzas', () => {
    it('crea multas, deudas e ingreso neto', async () => {
      const { service, prisma, members, gameId, finances } = await setup({ members: 4, maxMainSpots: 4 });

      // Sin vigilante para que el neto sea positivo y se registre ingreso.
      prisma.getGame(gameId)!.vigilante = 0;

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      const main = lists(prisma, gameId).main;
      // 2 asistieron y pagaron, 1 asistió sin pagar, 1 no asistió.
      await service.updateRegistration(main[0].id as string, { attended: true, paid: true }, ADMIN_ID, gameId);
      await service.updateRegistration(main[1].id as string, { attended: true, paid: true }, ADMIN_ID, gameId);
      await service.updateRegistration(main[2].id as string, { attended: true, paid: false }, ADMIN_ID, gameId);
      // main[3] queda sin asistir ni pagar.

      await service.complete(gameId, ADMIN_ID, { silent: true });

      // No-show de lista principal -> multa.
      expect(finances.createGameFines).toHaveBeenCalled();
      // Asistió sin pagar -> deuda.
      expect(finances.createGameDebts).toHaveBeenCalled();
      // Neto positivo (2 * 2000, vigilante 0) -> ingreso.
      expect(finances.createGameIncome).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario J: admin confirma una autopromoción por otro jugador', () => {
    it('flippea pendingConfirmation y audita con el actorId del admin', async () => {
      const { service, prisma, members, gameId, audit } = await setup({ members: 5, maxMainSpots: 4 });

      // 4 a principal, 1 a espera.
      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Se libera un cupo -> auto-promueve al waiter (queda pendiente de confirmar).
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(pending).toBeDefined();

      // El admin confirma por el jugador promovido (no puede estar en WhatsApp).
      const result = await service.confirmRegistration(gameId, pending.userId as string, ADMIN_ID);
      expect(result.confirmedOwn).toBe(true);

      const after = prisma.getRegistrations(gameId).find((r) => r.id === pending.id)!;
      expect(after.pendingConfirmation).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'confirmation_received',
          actorId: ADMIN_ID,
          targetUserId: pending.userId,
          details: expect.objectContaining({ onBehalf: true }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario K: el corte NO expira una autopromoción aún pendiente (regresión)', () => {
    it('autoPromoteIfNeeded al corte deja intacta la confirmación pendiente', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 5, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Se libera un cupo -> auto-promueve al waiter (ventana de 15 min activa).
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(pending).toBeDefined();

      // Llega el corte: el scheduler llama autoPromoteIfNeeded para llenar cupos.
      // NO debe tocar la confirmación pendiente que aún está dentro de su ventana.
      await service.autoPromoteIfNeeded(gameId, { skipMainListFullCheck: true });

      const after = prisma.getRegistrations(gameId).find((r) => r.id === pending.id)!;
      expect(after.isWaitingList).toBe(false);
      expect(after.pendingConfirmation).toBe(true);
      expect(after.confirmationDeclined).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario L: admin confirma un invitado por regId (UI)', () => {
    it('confirma el registro puntual de un invitado (sin userId propio)', async () => {
      const { service, prisma, members, gameId, audit, whatsapp } = await setup({ members: 1, maxMainSpots: 4 });
      const inviter = members[0];

      await service.register(gameId, inviter.id, inviter.id, { silent: true });
      const guestReg = await service.registerGuest(gameId, 'Pepito', inviter.id, { silent: true });

      // Simulamos que el invitado quedó pendiente de confirmación (p. ej. autopromoción).
      await prisma.gameRegistration.update({
        where: { id: guestReg.id as string },
        data: { pendingConfirmation: true },
      });

      const res = await service.confirmRegistrationById(gameId, guestReg.id as string, ADMIN_ID);
      expect(res.name).toBe('Pepito');

      const after = prisma.getRegistrations(gameId).find((r) => r.id === guestReg.id)!;
      expect(after.pendingConfirmation).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'confirmation_received',
          actorId: ADMIN_ID,
          details: expect.objectContaining({ onBehalf: true }),
        }),
      );
      // Se anuncia la confirmación al grupo de WhatsApp.
      expect(whatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('confirmó la asistencia de *Pepito*'),
      );
    });

    it('lanza si el registro no tiene confirmación pendiente', async () => {
      const { service, members, gameId } = await setup({ members: 1, maxMainSpots: 4 });
      const reg = await service.register(gameId, members[0].id, members[0].id, { silent: true });

      await expect(
        service.confirmRegistrationById(gameId, reg.id as string, ADMIN_ID),
      ).rejects.toThrow(NoPendingConfirmationException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario M: ventanas de confirmación 15 (primero) y 5 (cascada)', () => {
    const MIN = 60 * 1000;
    const deadlineWindow = (reg: Record<string, unknown>, since: number) =>
      (reg.confirmationDeadline as Date).getTime() - since;

    it('da 15 min al promover por cupo liberado y 5 min en cada continuación', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      // 4 a principal, 2 a espera.
      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Se libera un cupo -> PRIMERA promoción de la línea: ventana de 15 min.
      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      const beforeFirst = Date.now();
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      const first = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      const firstWindow = deadlineWindow(first, beforeFirst);
      expect(firstWindow).toBeGreaterThanOrEqual(15 * MIN);
      expect(firstWindow).toBeLessThan(15 * MIN + 5000);

      // El primero no confirma -> CONTINUACIÓN de la misma línea: ventana de 5 min.
      const beforeSecond = Date.now();
      await service.handleConfirmationTimeout(first.id as string);

      const second = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(second.id).not.toBe(first.id);
      const secondWindow = deadlineWindow(second, beforeSecond);
      expect(secondWindow).toBeGreaterThanOrEqual(5 * MIN);
      expect(secondWindow).toBeLessThan(5 * MIN + 5000);
      // Lo esencial: la continuación es más corta que la primera.
      expect(secondWindow).toBeLessThan(firstWindow);
    });

    it('un cupo distinto reinicia la ventana en 15 min (línea independiente)', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Primer cupo liberado -> promueve A (línea 1, 15 min, queda pendiente).
      const leave1 = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leave1.userId as string, leave1.userId as string, Role.member, { silent: true });
      const pendingA = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;

      // Se libera OTRO cupo distinto (otra línea) -> promueve B con 15 min frescos.
      const leave2 = lists(prisma, gameId).main.find((r) => !r.pendingConfirmation)!;
      const beforeB = Date.now();
      await service.removeRegistration(gameId, leave2.userId as string, leave2.userId as string, Role.member, { silent: true });

      const pendingsB = lists(prisma, gameId).main.filter((r) => r.pendingConfirmation && r.id !== pendingA.id);
      expect(pendingsB).toHaveLength(1);
      const windowB = deadlineWindow(pendingsB[0], beforeB);
      expect(windowB).toBeGreaterThanOrEqual(15 * MIN);
      expect(windowB).toBeLessThan(15 * MIN + 5000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario N: timeout antes del corte NO promueve invitados (regresión)', () => {
    it('al vencer la confirmación sube al siguiente MIEMBRO y salta a los invitados', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      // 4 miembros llenan la principal (members[0..3]).
      for (const m of members.slice(0, 4)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Lista de espera (antes del corte): invitado (pos 1) + 2 miembros (pos 2 y 3).
      // El invitado lo trae members[0] (en principal) para que no quede huérfano.
      await service.registerGuest(gameId, 'Invitado Espera', members[0].id, { silent: true });
      await service.register(gameId, members[4].id, members[4].id, { silent: true });
      await service.register(gameId, members[5].id, members[5].id, { silent: true });

      // Sanity: antes del corte el invitado es el primero en espera.
      const game = prisma.getGame(gameId)!;
      expect(service.isBeforeCutoff(game.guestCutoffTime as string, game.gameDate as Date)).toBe(true);
      expect(lists(prisma, gameId).wait[0].isGuest).toBe(true);

      // Se libera un cupo (sale members[1], que no invitó a nadie) -> auto-promueve
      // al PRIMER MIEMBRO de la espera (members[4]), saltando al invitado.
      await service.removeRegistration(gameId, members[1].id, members[1].id, Role.member, { silent: true });

      const firstPending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(firstPending.userId).toBe(members[4].id);

      // members[4] no confirma -> timeout. El siguiente elegible es members[5]
      // (miembro), NO el invitado, porque seguimos antes del corte.
      await service.handleConfirmationTimeout(firstPending.id as string);

      const guest = prisma.getRegistrations(gameId).find((r) => r.isGuest)!;
      expect(guest.isWaitingList).toBe(true);
      expect(guest.pendingConfirmation).toBe(false);

      const newPending = lists(prisma, gameId).main.find(
        (r) => r.pendingConfirmation && r.id !== firstPending.id,
      )!;
      expect(newPending).toBeDefined();
      expect(newPending.userId).toBe(members[5].id);
      expect(newPending.isGuest).toBeFalsy();
    });

    it('si no quedan miembros elegibles, deja el cupo libre en vez de subir al invitado', async () => {
      const { service, prisma, members, gameId, whatsapp } = await setup({ members: 5, maxMainSpots: 4 });

      for (const m of members.slice(0, 4)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }
      // Espera: invitado (pos 1) + 1 miembro (pos 2).
      await service.registerGuest(gameId, 'Invitado Espera', members[0].id, { silent: true });
      await service.register(gameId, members[4].id, members[4].id, { silent: true });

      // Cupo libre -> sube el miembro (salta invitado).
      await service.removeRegistration(gameId, members[1].id, members[1].id, Role.member, { silent: true });
      const pending = lists(prisma, gameId).main.find((r) => r.pendingConfirmation)!;
      expect(pending.userId).toBe(members[4].id);

      // El miembro no confirma -> no hay más miembros; el invitado NO debe subir.
      await service.handleConfirmationTimeout(pending.id as string);

      const guest = prisma.getRegistrations(gameId).find((r) => r.isGuest)!;
      expect(guest.isWaitingList).toBe(true);
      expect(guest.pendingConfirmation).toBe(false);
      // El cupo queda libre (3/4) y se anuncia que nadie confirmó.
      expect(lists(prisma, gameId).main).toHaveLength(3);
      expect(whatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('Nadie en lista de espera confirmó'),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Escenario 8: múltiples cupos libres → se llenan todos simultáneamente', () => {
    it('al llegar el corte con 3 cupos libres y 5 invitados en espera, sube a los 3 primeros a la vez', async () => {
      // maxMainSpots=6, 3 miembros en principal → 3 cupos libres.
      // 5 invitados en espera (antes del corte siempre van a espera).
      const { service, prisma, members, gameId, whatsapp } = await setup({ members: 4, maxMainSpots: 6 });

      // 3 miembros se anotan (dejan 3 cupos libres).
      for (const m of members.slice(0, 3)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // 5 invitados se anotan antes del corte → todos a espera.
      for (let i = 0; i < 5; i++) {
        await service.registerGuest(gameId, `Invitado ${i + 1}`, members[0].id, { silent: true });
      }

      let { main, wait } = lists(prisma, gameId);
      expect(main).toHaveLength(3);
      expect(wait).toHaveLength(5);

      // Pasa el corte: simulamos poniendo la fecha en el pasado.
      const g = prisma.getGame(gameId)!;
      g.gameDate = new Date('2020-01-01');

      // Llamada equivalente a la que hace el scheduler al llegar el corte.
      await service.autoPromoteIfNeeded(gameId, { skipMainListFullCheck: true });

      ({ main, wait } = lists(prisma, gameId));
      // Los 3 cupos libres deben llenarse con los 3 primeros invitados.
      expect(main).toHaveLength(6);
      expect(wait).toHaveLength(2);

      // Los 3 promovidos deben estar pendientes de confirmación.
      const pendingInMain = main.filter((r) => r.pendingConfirmation);
      expect(pendingInMain).toHaveLength(3);

      // Todos son invitados (los únicos en espera antes del corte).
      expect(pendingInMain.every((r) => r.isGuest)).toBe(true);

      // Un solo mensaje consolidado con los 3 @mentions.
      expect(whatsapp.sendToGroup).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('3 cupos disponibles'),
        expect.anything(),
      );
    });

    it('si hay exactamente 1 cupo libre, sigue usando el mensaje individual (no el consolidado)', async () => {
      const { service, prisma, members, gameId, whatsapp } = await setup({ members: 6, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      const leaving = lists(prisma, gameId).main.find((r) => r.position === 1)!;
      await service.removeRegistration(gameId, leaving.userId as string, leaving.userId as string, Role.member, { silent: true });

      // Solo 1 cupo libre → mensaje individual.
      expect(whatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('fue promovido a la'),
        expect.anything(),
      );
    });

    it('con múltiples cupos libres y menos candidatos que cupos, sube solo a los que hay', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 4, maxMainSpots: 6 });

      // 3 miembros en principal (3 cupos libres).
      for (const m of members.slice(0, 3)) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Solo 2 invitados en espera (menos que los cupos disponibles).
      await service.registerGuest(gameId, 'Invitado A', members[0].id, { silent: true });
      await service.registerGuest(gameId, 'Invitado B', members[0].id, { silent: true });

      // Pasa el corte.
      const g = prisma.getGame(gameId)!;
      g.gameDate = new Date('2020-01-01');

      await service.autoPromoteIfNeeded(gameId, { skipMainListFullCheck: true });

      const { main, wait } = lists(prisma, gameId);
      // Sube a los 2 invitados; queda 1 cupo libre.
      expect(main).toHaveLength(5);
      expect(wait).toHaveLength(0);
      expect(main.filter((r) => r.pendingConfirmation)).toHaveLength(2);
    });

    it('si la lista principal ya está llena al llegar el corte, nadie sube', async () => {
      const { service, prisma, members, gameId } = await setup({ members: 6, maxMainSpots: 4 });

      for (const m of members) {
        await service.register(gameId, m.id, m.id, { silent: true });
      }

      // Pasa el corte con la lista principal llena (4/4).
      const g = prisma.getGame(gameId)!;
      g.gameDate = new Date('2020-01-01');

      const { main: beforeMain, wait: beforeWait } = lists(prisma, gameId);
      expect(beforeMain).toHaveLength(4);
      expect(beforeWait).toHaveLength(2);

      await service.autoPromoteIfNeeded(gameId, { skipMainListFullCheck: true });

      const { main, wait } = lists(prisma, gameId);
      expect(main).toHaveLength(4); // sin cambios
      expect(wait).toHaveLength(2);
      expect(main.filter((r) => r.pendingConfirmation)).toHaveLength(0);
    });
  });
});
