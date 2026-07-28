import { BadRequestException, LoggerService } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { reportCaughtError } from './report-caught-error';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn((callback: (scope: { setTag: jest.Mock }) => void) =>
    callback({ setTag: jest.fn() }),
  ),
}));

describe('reportCaughtError', () => {
  const logger: LoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('captura errores inesperados con Sentry y logger', () => {
    const error = new Error('boom');
    reportCaughtError(logger, 'cron de prueba', error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it('no captura errores de negocio esperados', () => {
    reportCaughtError(logger, 'comando de prueba', new BadRequestException('esperado'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });
});
