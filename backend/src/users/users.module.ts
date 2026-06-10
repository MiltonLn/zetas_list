import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BirthdaySchedulerService } from './birthday-scheduler.service';

@Module({
  imports: [AuditModule, WhatsappModule],
  providers: [UsersService, BirthdaySchedulerService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
