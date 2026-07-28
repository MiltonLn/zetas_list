import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { GAME_MANAGERS } from '../common/constants/roles';
import { FinancesService } from '../finances/finances.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { GameEventsService } from './game-events.service';
import { GameNotifier } from './events/game-notifier.service';
import {
  AlreadyRegisteredException,
  CannotRemoveOtherException,
  GameNotOpenException,
  InactiveUserException,
  InvalidGuestNameException,
  InvalidRegistrationOrderException,
  MustBeRegisteredFirstException,
  NotRegisteredException,
  ProxyLimitExceededException,
  UserHasUnpaidFinesException,
} from './exceptions';
import { GameQueryService } from './game-query.service';
import {
  displayName,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
  shouldGoToWaitingList,
  userDisplayName,
} from './games.utils';
import { withGameLock, withGameLockAndFetch } from './transaction.util';
import { WaitlistService } from './waitlist.service';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private notifier: GameNotifier,
    private finances: FinancesService,
    private query: GameQueryService,
    private waitlist: WaitlistService,
  ) {}

  async register(
    gameId: string,
    userId: string,
    registeredById: string,
    options?: { silent?: boolean },
  ) {
    const registration = await withGameLockAndFetch(this.prisma, gameId, async (tx, game) => {
      if (game.status !== 'registration_open' && game.status !== 'in_progress') {
        throw new GameNotOpenException();
      }

      const existing = await tx.gameRegistration.findFirst({ where: { gameId, userId } });
      if (existing) {
        if (existing.confirmationDeclined && existing.isWaitingList) {
          await tx.gameRegistration.update({
            where: { id: existing.id },
            data: { confirmationDeclined: false },
          });
          const mainCount = await tx.gameRegistration.count({
            where: { gameId, isWaitingList: false },
          });
          if (mainCount < game.maxMainSpots) {
            const maxPos = await tx.gameRegistration.aggregate({
              where: { gameId, isWaitingList: false },
              _max: { position: true },
            });
            return tx.gameRegistration.update({
              where: { id: existing.id },
              data: {
                isWaitingList: false,
                position: (maxPos._max.position ?? 0) + 1,
              },
              include: REGISTRATION_INCLUDE,
            });
          }
          return tx.gameRegistration.update({
            where: { id: existing.id },
            data: { confirmationDeclined: false },
            include: REGISTRATION_INCLUDE,
          });
        }
        throw new AlreadyRegisteredException();
      }

      const isSelfRegister = userId === registeredById;
      const targetUser = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });
      if (targetUser && targetUser.status !== 'active') {
        throw new InactiveUserException();
      }
      if (await this.finances.hasUnpaidFines(userId, tx)) {
        throw new UserHasUnpaidFinesException();
      }

      if (!isSelfRegister) {
        const actor = await tx.user.findUnique({
          where: { id: registeredById },
          select: { role: true },
        });
        if (actor?.role !== 'admin') {
          const actorRegistered = await tx.gameRegistration.findFirst({
            where: { gameId, userId: registeredById },
          });
          if (!actorRegistered) throw new MustBeRegisteredFirstException();
        }
        const proxyCount = await tx.gameRegistration.count({
          where: { gameId, registeredById, userId: { not: registeredById } },
        });
        if (actor?.role !== 'admin' && proxyCount >= game.maxProxyRegistrations) {
          throw new ProxyLimitExceededException(game.maxProxyRegistrations);
        }
      }

      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);
      const eligibleWaitCount = await tx.gameRegistration.count({
        where: {
          gameId,
          isWaitingList: true,
          confirmationDeclined: false,
          ...(beforeCutoff ? { isGuest: false } : {}),
        },
      });
      const waitList = shouldGoToWaitingList(
        mainCount,
        eligibleWaitCount,
        game.maxMainSpots,
        game.mainListHasBeenFull,
        false,
        false,
      );
      this.logger.log(
        `[REGISTER] user=${userId} | mainCount=${mainCount}/${game.maxMainSpots} | eligibleWait=${eligibleWaitCount} | beforeCutoff=${beforeCutoff} | mainListHasBeenFull=${game.mainListHasBeenFull} | -> waitList=${waitList}`,
      );

      if (!waitList && mainCount + 1 >= game.maxMainSpots && !game.mainListHasBeenFull) {
        await tx.game.update({
          where: { id: gameId },
          data: { mainListHasBeenFull: true },
        });
      }
      if (waitList && !game.mainListHasBeenFull && mainCount >= game.maxMainSpots) {
        await tx.game.update({
          where: { id: gameId },
          data: { mainListHasBeenFull: true },
        });
      }

      const maxPosition = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: waitList },
        _max: { position: true },
      });
      return tx.gameRegistration.create({
        data: {
          gameId,
          userId,
          position: (maxPosition._max.position ?? 0) + 1,
          isWaitingList: waitList,
          registeredAt: new Date(),
          registeredById,
        },
        include: REGISTRATION_INCLUDE,
      });
    });

    await this.audit.log({
      gameId,
      actorId: registeredById,
      targetUserId: userId,
      action:
        registration.registeredById !== registration.userId
          ? 'proxy_registered'
          : 'player_registered',
      details: {
        position: registration.position,
        isWaitingList: registration.isWaitingList,
        pendingConfirmation: registration.pendingConfirmation,
      },
    });
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    if (!options?.silent) {
      const onBehalf = registration.registeredById !== registration.userId;
      this.notifier.announcePlayerRegistered({
        playerName: registration.user ? userDisplayName(registration.user) : 'Alguien',
        registeredByName:
          onBehalf && registration.registeredBy
            ? userDisplayName(registration.registeredBy)
            : undefined,
        isWaitingList: registration.isWaitingList,
        position: registration.position,
        game: updated,
      });
    }
    return registration;
  }

  async registerGuest(
    gameId: string,
    guestName: string,
    invitedById: string,
    options?: { silent?: boolean },
  ) {
    const trimmedName = guestName?.trim();
    if (!trimmedName) throw new InvalidGuestNameException();

    const registration = await withGameLockAndFetch(this.prisma, gameId, async (tx, game) => {
      if (game.status !== 'registration_open' && game.status !== 'in_progress') {
        throw new GameNotOpenException();
      }
      if (await this.finances.hasUnpaidFines(invitedById, tx)) {
        throw new UserHasUnpaidFinesException();
      }
      const inviter = await tx.user.findUnique({
        where: { id: invitedById },
        select: { role: true },
      });
      if (inviter?.role !== 'admin') {
        const inviterRegistration = await tx.gameRegistration.findFirst({
          where: { gameId, userId: invitedById },
        });
        if (!inviterRegistration) throw new MustBeRegisteredFirstException();
      }
      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);
      const eligibleWaitCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: true, confirmationDeclined: false },
      });
      const waitList = shouldGoToWaitingList(
        mainCount,
        eligibleWaitCount,
        game.maxMainSpots,
        game.mainListHasBeenFull,
        true,
        beforeCutoff,
      );
      this.logger.log(
        `[REGISTER_GUEST] guest="${trimmedName}" | mainCount=${mainCount}/${game.maxMainSpots} | eligibleWait=${eligibleWaitCount} | beforeCutoff=${beforeCutoff} | mainListHasBeenFull=${game.mainListHasBeenFull} | -> waitList=${waitList}`,
      );
      if (!waitList && mainCount + 1 >= game.maxMainSpots && !game.mainListHasBeenFull) {
        await tx.game.update({
          where: { id: gameId },
          data: { mainListHasBeenFull: true },
        });
      }
      if (waitList && !game.mainListHasBeenFull && mainCount >= game.maxMainSpots) {
        await tx.game.update({
          where: { id: gameId },
          data: { mainListHasBeenFull: true },
        });
      }
      const maxPosition = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: waitList },
        _max: { position: true },
      });
      return tx.gameRegistration.create({
        data: {
          gameId,
          userId: null,
          position: (maxPosition._max.position ?? 0) + 1,
          isWaitingList: waitList,
          registeredAt: new Date(),
          registeredById: invitedById,
          isGuest: true,
          guestName: trimmedName,
        },
        include: REGISTRATION_INCLUDE,
      });
    });

    await this.audit.log({
      gameId,
      actorId: invitedById,
      action: 'guest_registered',
      details: {
        guestName: trimmedName,
        position: registration.position,
        isWaitingList: registration.isWaitingList,
      },
    });
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    if (!options?.silent) {
      this.notifier.announceGuestRegistered({
        guestName: trimmedName,
        inviterName: registration.registeredBy
          ? userDisplayName(registration.registeredBy)
          : undefined,
        isWaitingList: registration.isWaitingList,
        position: registration.position,
        game: updated,
      });
    }
    return registration;
  }

  async removeRegistration(
    gameId: string,
    userId: string,
    actorId: string,
    actorRole: Role,
    options?: { silent?: boolean; regId?: string },
  ) {
    const result = await withGameLock(this.prisma, gameId, async (tx) => {
      const foundReg = options?.regId
        ? await tx.gameRegistration.findFirst({
            where: { id: options.regId, gameId },
            include: {
              user: { select: { name: true } },
              registeredBy: { select: { name: true } },
            },
          })
        : await tx.gameRegistration.findFirst({
            where: { gameId, userId },
            include: {
              user: { select: { name: true } },
              registeredBy: { select: { name: true } },
            },
          });
      if (!foundReg) throw new NotRegisteredException();
      const regOwnerId = foundReg.userId ?? foundReg.registeredById;
      if (!GAME_MANAGERS.includes(actorRole) && actorId !== regOwnerId) {
        throw new CannotRemoveOtherException();
      }
      const orphanedGuests = foundReg.userId
        ? await tx.gameRegistration.findMany({
            where: { gameId, isGuest: true, registeredById: foundReg.userId },
            select: {
              id: true,
              guestName: true,
              position: true,
              isWaitingList: true,
            },
          })
        : [];
      await tx.gameRegistration.delete({ where: { id: foundReg.id } });
      await tx.gameRegistration.updateMany({
        where: {
          gameId,
          isWaitingList: foundReg.isWaitingList,
          position: { gt: foundReg.position },
        },
        data: { position: { decrement: 1 } },
      });
      if (orphanedGuests.length > 0) {
        await tx.gameRegistration.deleteMany({
          where: { id: { in: orphanedGuests.map((guest) => guest.id) } },
        });
        for (const guest of [...orphanedGuests].sort((a, b) => b.position - a.position)) {
          await tx.gameRegistration.updateMany({
            where: {
              gameId,
              isWaitingList: guest.isWaitingList,
              position: { gt: guest.position },
            },
            data: { position: { decrement: 1 } },
          });
        }
      }
      return {
        reg: foundReg,
        orphanedGuests,
        wasMainList: !foundReg.isWaitingList,
        userName: displayName(foundReg),
      };
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: result.reg.userId ?? undefined,
      action: 'player_removed',
      details: {
        position: result.reg.position,
        wasWaiting: result.reg.isWaitingList,
        guestName: result.reg.guestName,
        removedGuests: result.orphanedGuests.map((guest) => guest.guestName),
      },
    });
    this.logger.log(
      `[REMOVE] game=${gameId} | player=${result.userName} | wasWaiting=${result.reg.isWaitingList} | byAdmin=${actorId !== (result.reg.userId ?? result.reg.registeredById)} | removedGuests=${result.orphanedGuests.length}`,
    );
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    if (!options?.silent) {
      await this.notifier.announcePlayerRemoved({
        playerName: result.userName,
        removedBySelf: actorId === (result.reg.userId ?? result.reg.registeredById),
        removedGuestNames: result.orphanedGuests.map(
          (guest) => guest.guestName || 'Invitado',
        ),
        game: updated,
      });
    }
    if (result.wasMainList) await this.waitlist.autoPromoteIfNeeded(gameId);
    if (result.orphanedGuests.some((guest) => !guest.isWaitingList)) {
      await this.waitlist.autoPromoteIfNeeded(gameId);
    }
    return updated;
  }

  async updateRegistration(
    regId: string,
    dto: UpdateRegistrationDto,
    actorId: string,
    gameId: string,
  ) {
    const result = await withGameLock(this.prisma, gameId, async (tx) => {
      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId },
      });
      if (!reg) throw new NotRegisteredException();
      const attendanceWasAutomatic =
        dto.paid === true && dto.attended === undefined && !reg.attended;
      const paymentWasAutomatic =
        dto.attended === false && dto.paid === undefined && reg.paid;
      let updateData: UpdateRegistrationDto = dto;
      if (dto.paid === true) updateData = { ...dto, attended: true };
      else if (dto.attended === false) updateData = { ...dto, paid: false };

      const updated = await tx.gameRegistration.update({
        where: { id: regId, gameId },
        data: updateData,
        include: REGISTRATION_INCLUDE,
      });
      return { reg, updated, updateData, attendanceWasAutomatic, paymentWasAutomatic };
    });
    const { reg, updated, updateData, attendanceWasAutomatic, paymentWasAutomatic } = result;
    if (attendanceWasAutomatic) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'attendance_toggled',
        details: { attended: true, automatic: true },
      });
    } else if (dto.attended !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'attendance_toggled',
        details: { attended: updateData.attended },
      });
    }
    if (paymentWasAutomatic) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'payment_toggled',
        details: { paid: false, automatic: true },
      });
    } else if (dto.paid !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'payment_toggled',
        details: { paid: updateData.paid },
      });
    }
    if (dto.note !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'note_updated',
        details: { note: dto.note },
      });
    }
    const fullGame = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: fullGame });
    return updated;
  }

  async reorder(gameId: string, dto: ReorderDto, actorId: string) {
    await withGameLock(this.prisma, gameId, async (tx) => {
      const registrations = await tx.gameRegistration.findMany({
        where: { gameId },
        select: { id: true },
      });
      const actualIds = registrations.map(({ id }) => id);
      const submittedIds = [...dto.mainList, ...dto.waitList];
      const uniqueSubmittedIds = new Set(submittedIds);
      const isExactPartition =
        submittedIds.length === actualIds.length &&
        uniqueSubmittedIds.size === submittedIds.length &&
        actualIds.every((id) => uniqueSubmittedIds.has(id));
      if (!isExactPartition) throw new InvalidRegistrationOrderException();

      for (let index = 0; index < dto.mainList.length; index++) {
        await tx.gameRegistration.updateMany({
          where: { id: dto.mainList[index], gameId },
          data: { position: index + 1, isWaitingList: false },
        });
      }
      for (let index = 0; index < dto.waitList.length; index++) {
        await tx.gameRegistration.updateMany({
          where: { id: dto.waitList[index], gameId },
          data: { position: index + 1, isWaitingList: true },
        });
      }
    });
    await this.audit.log({
      gameId,
      actorId,
      action: 'player_reordered',
      details: {
        mainListCount: dto.mainList.length,
        waitListCount: dto.waitList.length,
      },
    });
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async getAvailableMembers(gameId: string) {
    const registeredUserIds = await this.prisma.gameRegistration.findMany({
      where: { gameId, userId: { not: null } },
      select: { userId: true },
    });
    const excludeIds = registeredUserIds.flatMap((registration) =>
      registration.userId ? [registration.userId] : [],
    );
    return this.prisma.user.findMany({
      where: { status: 'active', id: { notIn: excludeIds } },
      select: { id: true, name: true, phone: true, username: true },
      orderBy: { name: 'asc' },
    });
  }
}
