// Sentry must be initialized before any other import.
import './instrument';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { configureApp } from './app-config';
import { env, isProduction } from './config/env';

async function bootstrap() {
  // Env vars are validated on import of ./config/env (via ./instrument), so by
  // this point every value below is present and well-formed.
  console.log(`[STARTUP] Iniciando bootstrap (NODE_ENV=${env.NODE_ENV})...`);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  console.log('[STARTUP] App creada, configurando middlewares...');

  configureApp(app);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.enableCors({
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Zetas List API')
      .setDescription('API para la gestión de partidos de Volley Zetas Ingenio')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  console.log(`[STARTUP] Escuchando en 0.0.0.0:${env.PORT}...`);
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`[STARTUP] Servidor listo en http://0.0.0.0:${env.PORT}`);
}

bootstrap();
