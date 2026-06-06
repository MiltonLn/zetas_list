import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[STARTUP] Iniciando bootstrap...');
  console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[STARTUP] PORT=${process.env.PORT}`);
  console.log(`[STARTUP] DATABASE_URL set=${!!process.env.DATABASE_URL}`);
  console.log(`[STARTUP] JWT_SECRET set=${!!process.env.JWT_SECRET}`);

  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[STARTUP] FATAL: JWT_SECRET env variable is required in production');
    process.exit(1);
  }

  console.log('[STARTUP] Creando app NestJS...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  console.log('[STARTUP] App creada, configurando middlewares...');

  app.use(cookieParser());

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api', {
    exclude: ['/health'],
  });

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Zetas List API')
      .setDescription('API para la gestión de partidos de Volley Zetas Ingenio')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  console.log(`[STARTUP] Escuchando en 0.0.0.0:${port}...`);
  await app.listen(port, '0.0.0.0');
  console.log(`[STARTUP] Servidor listo en http://0.0.0.0:${port}`);
}

bootstrap();
