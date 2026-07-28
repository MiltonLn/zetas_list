import { GameQueryService } from '../../games/game-query.service';
import {
  buildGameLink,
  displayName,
  userDisplayName,
} from '../../games/games.utils';

export type ActiveGame = NonNullable<
  Awaited<ReturnType<GameQueryService['findActiveGame']>>
>;

export function formatListForWhatsapp(game: ActiveGame): string {
  const mainList = game.registrations.filter(
    (registration) => !registration.isWaitingList,
  );
  const waitList = game.registrations.filter(
    (registration) => registration.isWaitingList,
  );
  const spotsLeft = Math.max(0, game.maxMainSpots - mainList.length);
  const lines = [
    `📋 *${game.title}*`,
    `📍 Cupos: ${mainList.length}/${game.maxMainSpots} (${spotsLeft} disponibles)`,
    '',
  ];

  if (mainList.length > 0) {
    lines.push('*Lista Principal:*');
    mainList.forEach((registration, index) => {
      const name = registration.isGuest
        ? `${registration.guestName || 'Invitado'} 👤 _(inv. de ${
            registration.registeredBy
              ? userDisplayName(registration.registeredBy)
              : '?'
          })_`
        : displayName(registration);
      lines.push(
        `${index + 1}. ${name}${registration.pendingConfirmation ? ' ⏳' : ''}`,
      );
    });
  }

  if (waitList.length > 0) {
    lines.push('', `*Lista de Espera (${waitList.length}):*`);
    waitList.forEach((registration, index) => {
      const name = registration.isGuest
        ? `${registration.guestName || 'Invitado'} 👤 _(inv. de ${
            registration.registeredBy
              ? userDisplayName(registration.registeredBy)
              : '?'
          })_`
        : displayName(registration);
      lines.push(`${index + 1}. ${name}`);
    });
  }
  if (mainList.length === 0) lines.push('_Sin anotados aún_');
  lines.push(buildGameLink(game.id));
  return lines.join('\n');
}
