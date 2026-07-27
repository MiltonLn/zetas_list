import { Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { GameEventsService } from './game-events.service';
import { GameSchedulerService } from './game-scheduler.service';
import { GameNotifier } from './events/game-notifier.service';
import { GameQueryService } from './game-query.service';
import { ConfirmationService } from './confirmation.service';
import { WaitlistService } from './waitlist.service';
import { GameLifecycleService } from './game-lifecycle.service';
import { AuditModule } from '../audit/audit.module';
import { FinancesModule } from '../finances/finances.module';

@Module({
  imports: [AuditModule, FinancesModule],
  providers: [
    GamesService,
    GameEventsService,
    GameSchedulerService,
    GameNotifier,
    GameQueryService,
    ConfirmationService,
    WaitlistService,
    GameLifecycleService,
  ],
  controllers: [GamesController],
  exports: [GamesService, GameEventsService],
})
export class GamesModule {}
