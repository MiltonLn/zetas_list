import { Module, forwardRef } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { GameEventsService } from './game-events.service';
import { GameSchedulerService } from './game-scheduler.service';
import { AuditModule } from '../audit/audit.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [AuditModule, forwardRef(() => WhatsappModule)],
  providers: [GamesService, GameEventsService, GameSchedulerService],
  controllers: [GamesController],
  exports: [GamesService, GameEventsService],
})
export class GamesModule {}
