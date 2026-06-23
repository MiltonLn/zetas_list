import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerConfig } from './common/logging/logger.config';
import { LogContextMiddleware } from './common/logging/log-context.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AuditModule } from './audit/audit.module';
import { FinancesModule } from './finances/finances.module';
import { OrdersModule } from './orders/orders.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { HealthController } from './health.controller';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(buildLoggerConfig()),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ...(isProduction
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', '..', 'public'),
            // Let the API and the dedicated /uploads static handler (see
            // main.ts useStaticAssets) own those paths; otherwise the SPA
            // fallback would serve index.html for avatar image requests.
            exclude: ['/api*', '/uploads*'],
          }),
        ]
      : []),
    PrismaModule,
    AuthModule,
    UsersModule,
    GamesModule,
    WhatsappModule,
    AuditModule,
    FinancesModule,
    OrdersModule,
    TournamentsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LogContextMiddleware).forRoutes('*');
  }
}
