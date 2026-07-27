import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Global HTTP configuration shared by the real server and the controller smoke
 * tests. Keeping it here means a test request goes through the same pipes,
 * filters and route prefix that production does.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(cookieParser());

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
}
