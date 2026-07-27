import { Game } from '@prisma/client';

/**
 * Domain events emitted by the games module. Every WhatsApp side effect used to
 * be a direct `WhatsappService` call from `GamesService`, which forced a
 * circular module dependency. Now the games module states *what happened* and a
 * listener in the WhatsApp module decides what to say about it.
 */
export const GameEvent = {
  RegistrationOpened: 'game.registration_opened',
  PlayerRegistered: 'game.player_registered',
  GuestRegistered: 'game.guest_registered',
  AttendanceConfirmed: 'game.attendance_confirmed',
  AttendanceConfirmedByStaff: 'game.attendance_confirmed_by_staff',
  PlayerRemoved: 'game.player_removed',
  PlayerPromoted: 'game.player_promoted',
  PlayerDemoted: 'game.player_demoted',
  PlayersAutoPromoted: 'game.players_auto_promoted',
  ConfirmationExpired: 'game.confirmation_expired',
  WaitlistExhausted: 'game.waitlist_exhausted',
  GuestCutoffReached: 'game.guest_cutoff_reached',
  GameCancelled: 'game.cancelled',
  GameCompleted: 'game.completed',
} as const;

/** Everything the "X/Y cupos" line and the deep link need. */
export interface GameSnapshot {
  id: string;
  maxMainSpots: number;
  registrations: Array<{ isWaitingList: boolean }>;
}

/**
 * A person the notification should reach directly. The WhatsApp module turns
 * this into a mention; other transports could do something else with it.
 */
export interface NotifiableTarget {
  displayName: string;
  phone?: string | null;
  whatsappLid?: string | null;
}

export interface RegistrationOpenedEvent {
  game: Pick<Game, 'id' | 'title'>;
}

export interface PlayerRegisteredEvent {
  playerName: string;
  /** Set only when someone else did the registering. */
  registeredByName?: string;
  isWaitingList: boolean;
  position: number;
  game: GameSnapshot;
}

export interface GuestRegisteredEvent {
  guestName: string;
  inviterName?: string;
  isWaitingList: boolean;
  position: number;
  game: GameSnapshot;
}

export interface AttendanceConfirmedEvent {
  confirmedByName: string;
  confirmedOwn: boolean;
  confirmedGuests: string[];
  /** True when an admin confirmed on someone else's behalf. */
  onBehalf: boolean;
}

export interface AttendanceConfirmedByStaffEvent {
  actorName: string;
  playerName: string;
}

export interface PlayerRemovedEvent {
  playerName: string;
  removedBySelf: boolean;
  removedGuestNames: string[];
  game: GameSnapshot;
}

export interface PlayerPromotedEvent {
  playerName: string;
  byAdmin: boolean;
  game: GameSnapshot;
}

export interface PlayerDemotedEvent {
  playerName: string;
  byAdmin: boolean;
  position: number;
  game: GameSnapshot;
}

/** One or more people moved up and now owe a confirmation. */
export interface PlayersAutoPromotedEvent {
  promoted: Array<{ playerName: string; target: NotifiableTarget | null }>;
  confirmWindowMinutes: number;
  game: GameSnapshot;
}

export interface ConfirmationExpiredEvent {
  playerName: string;
  returnedToPosition: number;
  game: GameSnapshot;
}

export type WaitlistExhaustedEvent = Record<string, never>;

export interface GuestCutoffReachedEvent {
  gameTitle: string;
}

export interface GameCancelledEvent {
  gameTitle: string;
  reason?: string;
}

export interface GameCompletedEvent {
  /** Pre-rendered report; the same text the UI shows. */
  report: string;
}
