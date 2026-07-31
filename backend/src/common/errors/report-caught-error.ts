import { LoggerService } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { isExpectedBusinessError } from './is-expected-error';

/**
 * Reports failures swallowed at async boundaries (cron jobs, event listeners
 * and WhatsApp commands). Expected 4xx/domain rejections stay out of Sentry.
 */
export function reportCaughtError(
  logger: LoggerService,
  context: string,
  error: unknown,
): void {
  if (isExpectedBusinessError(error)) {
    logger.debug?.(
      `${context}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('caught_error_context', context);
    Sentry.captureException(error);
  });
  logger.error(
    context,
    error instanceof Error ? error.stack : String(error),
  );
}
