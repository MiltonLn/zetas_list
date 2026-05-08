import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface GameEvent {
  gameId: string;
  type: 'update' | 'status_change';
  data: unknown;
}

@Injectable()
export class GameEventsService {
  private events$ = new Subject<GameEvent>();

  emit(event: GameEvent) {
    this.events$.next(event);
  }

  forGame(gameId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((e) => e.gameId === gameId),
      map(
        (e) =>
          ({
            data: JSON.stringify({ type: e.type, data: e.data }),
          }) as MessageEvent,
      ),
    );
  }
}
