import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { runWithLogContext, newReqId } from './log-context';

/**
 * Binds a correlation context to every HTTP request so that all logs emitted
 * while handling it (controllers, services, schedulers) share the same reqId.
 */
@Injectable()
export class LogContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithLogContext({ reqId: newReqId(), source: 'http' }, () => next());
  }
}
