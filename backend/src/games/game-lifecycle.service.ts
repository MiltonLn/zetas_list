import { Injectable, Logger } from '@nestjs/common';
import { GameStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinancesService } from '../finances/finances.service';
import { GameEventsService } from './game-events.service';
import { GameQueryService } from './game-query.service';
import { GameNotifier } from './events/game-notifier.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import {
  DuplicateGameException,
  GameAlreadyCompletedException,
  GameCancelledException,
  GameNotFoundException,
  NotRegisteredException,
} from './exceptions';
import {
  displayName,
  buildTitle,
  DEFAULT_SPOTS,
  DEFAULT_PRICE_PER_PLAYER,
  DEFAULT_VIGILANTE,
  DEFAULT_GUEST_CUTOFF,
  DEFAULT_MAX_PROXY,
  DEFAULT_REGISTRATION_OPEN_TIME,
} from './games.utils';

/**
 * Owns a game's arc: creation, opening registration, cancelling, completing,
 * and the report that closing one produces.
 */
@Injectable()
export class GameLifecycleService {
  private readonly logger = new Logger(GameLifecycleService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private query: GameQueryService,
    private notifier: GameNotifier,
    private finances: FinancesService,
  ) {}

  async create(dto: CreateGameDto, actorId: string) {
    const gameDate = new Date(dto.gameDate + 'T00:00:00');

    const game = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.game.findFirst({
          where: {
            gameDate,
            status: { notIn: [GameStatus.cancelled, GameStatus.completed] },
          },
        });
        if (existing) {
          throw new DuplicateGameException(dto.gameDate);
        }

        const startTime = dto.startTime ?? '18:50';
        const title = dto.customTitle?.trim() || buildTitle(dto.modalidad, dto.gameDate, startTime);
        const maxMainSpots = dto.maxMainSpots ?? DEFAULT_SPOTS[dto.modalidad];

        const registrationOpenTime = dto.registrationOpenTime ?? DEFAULT_REGISTRATION_OPEN_TIME;
        const registrationOpenAt = new Date(`${dto.gameDate}T${registrationOpenTime}:00-05:00`);

        const now = new Date();
        const initialStatus =
          registrationOpenAt <= now ? GameStatus.registration_open : GameStatus.scheduled;

        return tx.game.create({
          data: {
            title,
            modalidad: dto.modalidad,
            gameDate,
            startTime,
            registrationOpenAt,
            maxMainSpots,
            pricePerPlayer: dto.pricePerPlayer ?? DEFAULT_PRICE_PER_PLAYER,
            vigilante: dto.vigilante ?? DEFAULT_VIGILANTE,
            guestCutoffTime: dto.guestCutoffTime ?? DEFAULT_GUEST_CUTOFF,
            maxProxyRegistrations: dto.maxProxyRegistrations ?? DEFAULT_MAX_PROXY,
            status: initialStatus,
            createdById: actorId,
          },
          include: { createdBy: { select: { id: true, name: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId: game.id,
      actorId,
      action: 'game_created',
      details: { title: game.title, modalidad: dto.modalidad, gameDate: dto.gameDate },
    });

    if (game.status === GameStatus.registration_open) {
      this.notifier.announceRegistrationOpened({ game });
    }

    return game;
  }

  async openRegistration(gameId: string, actorId?: string) {
    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.registration_open },
    });

    await this.audit.log({
      gameId,
      actorId: actorId ?? null,
      action: 'game_status_changed',
      details: { newStatus: 'registration_open' },
    });

    this.events.emit({
      gameId,
      type: 'status_change',
      data: { status: GameStatus.registration_open },
    });

    return updated;
  }

  async cancel(gameId: string, dto: CancelGameDto, actorId: string) {
    const game = await this.query.findOne(gameId);
    if (game.status === GameStatus.completed || game.status === GameStatus.cancelled) {
      throw new GameAlreadyCompletedException();
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.cancelled, cancellationReason: dto.reason },
    });

    await this.audit.log({ gameId, actorId, action: 'game_cancelled', details: { reason: dto.reason } });
    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.cancelled } });

    this.notifier.announceGameCancelled({ gameTitle: game.title, reason: dto.reason });

    return updated;
  }

  async complete(gameId: string, actorId: string, options?: { silent?: boolean }) {
    const game = await this.query.findOne(gameId);

    if (game.status === GameStatus.completed) throw new GameAlreadyCompletedException();
    if (game.status === GameStatus.cancelled) throw new GameCancelledException();

    const report = this.generateReport(game);

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.completed, completionReport: report },
    });

    await this.audit.log({ gameId, actorId, action: 'game_completed', details: {} });
    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.completed } });

    // Auto-create fines for no-shows (main list, not attended, not exempt)
    const fined = game.registrations.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      await this.finances.createGameFines(gameId, fined, game.fineAmountNoShow, actorId);
    }

    // Auto-create debts for non-payers (attended but didn't pay)
    const debts = game.registrations.filter((r) => r.attended && !r.paid);
    if (debts.length > 0) {
      await this.finances.createGameDebts(gameId, debts, game.pricePerPlayer, actorId);
    }

    // Auto-create income entry for net game revenue
    const totalPaid = game.registrations.filter((r) => r.paid).length;
    const recaudado = totalPaid * game.pricePerPlayer;
    const neto = recaudado - (game.vigilante ?? 0);
    if (neto > 0) {
      await this.finances.createGameIncome(gameId, neto, game.gameDate, actorId);
    }

    if (!options?.silent) {
      this.notifier.announceGameCompleted({ report });
    }

    return { game: updated, report };
  }

  async previewReport(gameId: string) {
    const game = await this.query.findOne(gameId);
    const report = this.generateReport(game);
    const fineable = game.registrations
      .filter((r) => !r.attended && !r.isWaitingList)
      .map((r) => ({
        regId: r.id,
        userId: r.userId,
        name: displayName(r),
        fineExempt: r.fineExempt,
      }));
    return { report, fineable };
  }

  async setFineExempt(gameId: string, regId: string, exempt: boolean, actorId: string) {
    const reg = await this.prisma.gameRegistration.findFirst({ where: { id: regId, gameId } });
    if (!reg) throw new NotRegisteredException();

    await this.prisma.gameRegistration.update({ where: { id: regId }, data: { fineExempt: exempt } });
    await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'fine_exemption_toggled', details: { fineExempt: exempt } });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async getStoredReport(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { completionReport: true, status: true },
    });
    if (!game) throw new GameNotFoundException();

    if (game.completionReport) return { report: game.completionReport };
    const full = await this.query.findOne(gameId);
    return { report: this.generateReport(full) };
  }

  generateReport(game: Awaited<ReturnType<typeof this.query.findOne>>) {
    const allRegs = game.registrations;
    const mainList = allRegs.filter((r) => !r.isWaitingList);
    const attended = mainList.filter((r) => r.attended);
    const totalPaid = allRegs.filter((r) => r.paid).length;
    const recaudado = totalPaid * game.pricePerPlayer;

    const attendedNotPaid = allRegs.filter((r) => r.attended && !r.paid);
    const noShowPaid = allRegs.filter((r) => !r.attended && r.paid);

    const dateStr = new Date(game.gameDate).toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const vigilante = game.vigilante ?? 0;
    const neto = recaudado - vigilante;

    const lines: string[] = [
      `✅ *${game.title}*`,
      dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
      '',
      `✅ *Asistentes:* ${attended.length}/${mainList.length}`,
      `💰 *Recaudado:* $${recaudado.toLocaleString('es-CO')}`,
    ];

    if (vigilante > 0) {
      lines.push(`🛡️ *Vigilante:* -$${vigilante.toLocaleString('es-CO')}`);
      lines.push(`💵 *Neto:* $${neto.toLocaleString('es-CO')}`);
    }

    if (attendedNotPaid.length > 0) {
      lines.push('', `⚠️ *Asistieron sin pagar:* ${attendedNotPaid.length}`);
      attendedNotPaid.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    if (noShowPaid.length > 0) {
      lines.push('', `📌 *Pagaron pero no asistieron:* ${noShowPaid.length}`);
      noShowPaid.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    const fined = allRegs.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      lines.push('', `❌ *Multados:* ${fined.length}`);
      fined.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    return lines.join('\n');
  }
}
