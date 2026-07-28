import { Injectable } from '@nestjs/common';
import { CancelGameDto } from './dto/cancel-game.dto';
import { CreateGameDto } from './dto/create-game.dto';
import { ConfirmationService } from './confirmation.service';
import { GameLifecycleService } from './game-lifecycle.service';
import { GameQueryService } from './game-query.service';
import {
  buildCounts,
  buildGameLink,
  isBeforeCutoff,
  shouldGoToWaitingList,
} from './games.utils';
import { RegistrationService } from './registration.service';
import { WaitlistService } from './waitlist.service';

export { displayName, MODALIDAD_LABEL } from './games.utils';

@Injectable()
export class GamesService {
  constructor(
    private query: GameQueryService,
    private confirmation: ConfirmationService,
    private waitlist: WaitlistService,
    private lifecycle: GameLifecycleService,
    private registration: RegistrationService,
  ) {}

  buildCounts(
    game: {
      maxMainSpots: number;
      registrations: Array<{ isWaitingList: boolean }>;
    },
  ): string {
    return buildCounts(game);
  }

  buildGameLink(gameId: string): string {
    return buildGameLink(gameId);
  }

  findAll(...args: Parameters<GameQueryService['findAll']>) {
    return this.query.findAll(...args);
  }

  findOne(...args: Parameters<GameQueryService['findOne']>) {
    return this.query.findOne(...args);
  }

  findActiveGame(...args: Parameters<GameQueryService['findActiveGame']>) {
    return this.query.findActiveGame(...args);
  }

  confirmRegistration(
    ...args: Parameters<ConfirmationService['confirmRegistration']>
  ) {
    return this.confirmation.confirmRegistration(...args);
  }

  confirmRegistrationById(
    ...args: Parameters<ConfirmationService['confirmRegistrationById']>
  ) {
    return this.confirmation.confirmRegistrationById(...args);
  }

  handleConfirmationTimeout(
    ...args: Parameters<ConfirmationService['handleConfirmationTimeout']>
  ) {
    return this.confirmation.handleConfirmationTimeout(...args);
  }

  retryFromWaitingList(
    ...args: Parameters<WaitlistService['retryFromWaitingList']>
  ) {
    return this.waitlist.retryFromWaitingList(...args);
  }

  promote(...args: Parameters<WaitlistService['promote']>) {
    return this.waitlist.promote(...args);
  }

  promoteNext(...args: Parameters<WaitlistService['promoteNext']>) {
    return this.waitlist.promoteNext(...args);
  }

  demote(...args: Parameters<WaitlistService['demote']>) {
    return this.waitlist.demote(...args);
  }

  autoPromoteIfNeeded(
    ...args: Parameters<WaitlistService['autoPromoteIfNeeded']>
  ) {
    return this.waitlist.autoPromoteIfNeeded(...args);
  }

  create(dto: CreateGameDto, actorId: string) {
    return this.lifecycle.create(dto, actorId);
  }

  openRegistration(
    ...args: Parameters<GameLifecycleService['openRegistration']>
  ) {
    return this.lifecycle.openRegistration(...args);
  }

  cancel(gameId: string, dto: CancelGameDto, actorId: string) {
    return this.lifecycle.cancel(gameId, dto, actorId);
  }

  complete(...args: Parameters<GameLifecycleService['complete']>) {
    return this.lifecycle.complete(...args);
  }

  previewReport(...args: Parameters<GameLifecycleService['previewReport']>) {
    return this.lifecycle.previewReport(...args);
  }

  setFineExempt(...args: Parameters<GameLifecycleService['setFineExempt']>) {
    return this.lifecycle.setFineExempt(...args);
  }

  getStoredReport(...args: Parameters<GameLifecycleService['getStoredReport']>) {
    return this.lifecycle.getStoredReport(...args);
  }

  generateReport(...args: Parameters<GameLifecycleService['generateReport']>) {
    return this.lifecycle.generateReport(...args);
  }

  register(...args: Parameters<RegistrationService['register']>) {
    return this.registration.register(...args);
  }

  registerGuest(...args: Parameters<RegistrationService['registerGuest']>) {
    return this.registration.registerGuest(...args);
  }

  removeRegistration(
    ...args: Parameters<RegistrationService['removeRegistration']>
  ) {
    return this.registration.removeRegistration(...args);
  }

  updateRegistration(
    ...args: Parameters<RegistrationService['updateRegistration']>
  ) {
    return this.registration.updateRegistration(...args);
  }

  reorder(...args: Parameters<RegistrationService['reorder']>) {
    return this.registration.reorder(...args);
  }

  getAvailableMembers(
    ...args: Parameters<RegistrationService['getAvailableMembers']>
  ) {
    return this.registration.getAvailableMembers(...args);
  }

  shouldGoToWaitingList(
    mainCount: number,
    waitCount: number,
    maxMainSpots: number,
    mainListHasBeenFull: boolean,
    isGuest: boolean,
    beforeCutoff: boolean,
  ): boolean {
    return shouldGoToWaitingList(
      mainCount,
      waitCount,
      maxMainSpots,
      mainListHasBeenFull,
      isGuest,
      beforeCutoff,
    );
  }

  isBeforeCutoff(
    cutoffTime: string,
    gameDate?: Date | string,
  ): boolean {
    return isBeforeCutoff(cutoffTime, gameDate);
  }
}
