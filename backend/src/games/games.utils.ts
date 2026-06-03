import { Modalidad } from '@prisma/client';

const COLOMBIA_OFFSET_MIN = -5 * 60;

export const DEFAULT_SPOTS: Record<Modalidad, number> = {
  seis_x_seis: 18,
  cuatro_x_cuatro: 12,
};

export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  seis_x_seis: '6x6',
  cuatro_x_cuatro: '4x4',
};

export const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;
export const NEXT_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_PRICE_PER_PLAYER = 2000;
export const DEFAULT_VIGILANTE = 10000;
export const DEFAULT_GUEST_CUTOFF = '13:30';
export const DEFAULT_MAX_PROXY = 1;
export const DEFAULT_REGISTRATION_OPEN_TIME = '10:00';

export const REGISTRATION_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      position: true,
      gender: true,
      heightCm: true,
      birthDate: true,
      photoUrl: true,
      bio: true,
    },
  },
  registeredBy: {
    select: { id: true, name: true, username: true, phone: true },
  },
} as const;

/**
 * Builds the inline `@<number>` token used in WhatsApp mentions. The number
 * must match the JID user part (digits only) for the mention to resolve.
 */
export function mentionTag(phone: string): string {
  return `@${phone.replace(/\D/g, '')}`;
}

export function displayName(r: { isGuest: boolean; guestName?: string | null; user?: { name: string } | null; registeredBy?: { name: string } | null }): string {
  if (r.isGuest) {
    const inviter = r.registeredBy?.name || '?';
    return `${r.guestName || 'Invitado'} (inv. de ${inviter})`;
  }
  return r.user?.name || 'Desconocido';
}

export function buildCounts(game: { maxMainSpots: number; registrations: Array<{ isWaitingList: boolean }> }): string {
  const mainCount = game.registrations.filter((r) => !r.isWaitingList).length;
  const waitCount = game.registrations.filter((r) => r.isWaitingList).length;
  const max = game.maxMainSpots;

  if (mainCount >= max) {
    let msg = `📊 Lista principal *llena* (${mainCount}/${max})`;
    if (waitCount > 0) msg += ` · ${waitCount} en espera`;
    return msg;
  }
  return `📊 *${mainCount}/${max}* cupos ocupados (${max - mainCount} disponibles)`;
}

export function buildTitle(modalidad: Modalidad, gameDate: string, startTime: string): string {
  const date = new Date(gameDate + 'T00:00:00');
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `Volley Ingenio ${MODALIDAD_LABEL[modalidad]} ${day}/${month}/${year} ${startTime}pm`;
}

export function buildGameLink(gameId: string): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return '';
  return `\n🔗 ${appUrl}/game/${gameId}`;
}

export function buildRegistrationOpenMessage(game: { id: string; title: string }): string {
  const appUrl = process.env.APP_URL || '';
  const gameUrl = `${appUrl}/game/${game.id}`;
  return (
    `🏐 *${game.title}*\n\n` +
    `¡La inscripción está abierta! 🎉\n\n` +
    `Anótate aquí: ${gameUrl}\n\n` +
    `O escríbeme aquí: *@Z anotame*`
  );
}

export function shouldGoToWaitingList(
  mainCount: number,
  eligibleWaitCount: number,
  maxMainSpots: number,
  mainListHasBeenFull: boolean,
  isGuest: boolean,
  beforeCutoff: boolean,
): boolean {
  if (isGuest && beforeCutoff) return true;
  if (mainCount >= maxMainSpots) return true;
  if (mainListHasBeenFull && eligibleWaitCount > 0) return true;
  return false;
}

export function isBeforeCutoff(cutoffTime: string, gameDate?: Date | string): boolean {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaMs = utcMs + COLOMBIA_OFFSET_MIN * 60000;
  const colombiaNow = new Date(colombiaMs);

  if (gameDate) {
    const gd = new Date(gameDate);
    const gameDateOnly = new Date(gd.getFullYear(), gd.getMonth(), gd.getDate());
    const todayOnly = new Date(colombiaNow.getFullYear(), colombiaNow.getMonth(), colombiaNow.getDate());
    if (todayOnly < gameDateOnly) return true;
    if (todayOnly > gameDateOnly) return false;
  }

  const [cutH, cutM] = cutoffTime.split(':').map(Number);
  const cutoffMinutes = cutH * 60 + cutM;
  const nowMinutes = colombiaNow.getHours() * 60 + colombiaNow.getMinutes();
  return nowMinutes < cutoffMinutes;
}

export function buildCutoffDateTime(cutoffTime: string, gameDate?: Date | string): Date {
  if (gameDate) {
    const gd = new Date(gameDate);
    const dateStr = `${gd.getFullYear()}-${String(gd.getMonth() + 1).padStart(2, '0')}-${String(gd.getDate()).padStart(2, '0')}`;
    return new Date(`${dateStr}T${cutoffTime}:00-05:00`);
  }
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaMs = utcMs + COLOMBIA_OFFSET_MIN * 60000;
  const colombiaDate = new Date(colombiaMs);
  const dateStr = `${colombiaDate.getFullYear()}-${String(colombiaDate.getMonth() + 1).padStart(2, '0')}-${String(colombiaDate.getDate()).padStart(2, '0')}`;
  return new Date(`${dateStr}T${cutoffTime}:00-05:00`);
}

export function formatCutoffTime(cutoffTime: string): string {
  const [h, m] = cutoffTime.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return m === 0 ? `${hour12}:00 ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
