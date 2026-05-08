import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { SentryModule } from '@sentry/nestjs/setup';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ...(isProduction
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            exclude: ['/api*'],
          }),
        ]
      : []),
    PrismaModule,
    AuthModule,
    UsersModule,
    GamesModule,
    WhatsappModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
