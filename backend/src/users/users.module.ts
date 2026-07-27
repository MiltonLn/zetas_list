import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';
import { BirthdaySchedulerService } from './birthday-scheduler.service';

@Module({
  imports: [AuditModule],
  providers: [UsersService, BirthdaySchedulerService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
