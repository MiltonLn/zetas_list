// Domain enums are generated from backend/prisma/schema.prisma so they cannot
// drift from the backend. See scripts/generate-api-types.mjs.
export type {
  AuditAction,
  AuditLogBase,
  FinanceTransactionBase,
  FineStatus,
  FineBase,
  Gender,
  GameBase,
  GameRegistrationBase,
  GameStatus,
  Modalidad,
  OrderBase,
  OrderItemBase,
  OrderStatus,
  Position,
  Role,
  ShirtSize,
  TransactionType,
  UserBase,
  UserStatus,
} from './api-types.gen';

import type {
  AuditAction,
  AuditLogBase,
  Gender,
  GameBase,
  GameRegistrationBase,
  GameStatus,
  Modalidad,
  OrderBase,
  OrderItemBase,
  OrderStatus,
  Position,
  ShirtSize,
  UserBase,
  UserStatus,
} from './api-types.gen';
import { SHIRT_SIZE_VALUES } from './api-types.gen';

export type User = UserBase;

export interface AuthUser extends Pick<
  UserBase,
  'id' | 'username' | 'name' | 'role' | 'phone'
> {
  alias?: string | null;
  position?: Position | null;
  gender?: Gender | null;
  photoUrl?: string | null;
  mustChangePassword?: boolean;
}

export interface RegistrationUser extends Pick<
  UserBase,
  'id' | 'name' | 'username' | 'phone'
> {
  alias?: string | null;
  position?: Position | null;
  gender?: Gender | null;
  heightCm?: number | null;
  birthDate?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
}

export interface GameRegistration extends Omit<
  GameRegistrationBase,
  'note' | 'guestName' | 'confirmationDeadline' | 'originalWaitPosition'
> {
  note?: string | null;
  guestName?: string | null;
  confirmationDeadline?: string | null;
  originalWaitPosition?: number | null;
  user: RegistrationUser | null;
  registeredBy: { id: string; name: string; alias?: string | null; username: string } | null;
}

export interface Game extends GameBase {
  registrations: GameRegistration[];
  createdBy?: { id: string; name: string } | null;
  _count?: { registrations: number };
}

export interface AuditLog extends Omit<AuditLogBase, 'gameId' | 'targetUserId'> {
  gameId?: string | null;
  targetUserId?: string | null;
  actor: { id: string; name: string; username: string } | null;
  targetUser?: { id: string; name: string; username: string } | null;
}

export const MODALIDAD_LABELS: Record<Modalidad, string> = {
  seis_x_seis: '6x6',
  cuatro_x_cuatro: '4x4',
};

export const POSITION_LABELS: Record<Position, string> = {
  auxiliar: 'Auxiliar',
  libero: 'Líbero',
  armador: 'Armador',
  central: 'Central',
  opuesto: 'Opuesto',
};

export const GENDER_LABELS: Record<Gender, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  otro: 'Otro',
};

export const SHIRT_SIZES: readonly ShirtSize[] = SHIRT_SIZE_VALUES;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  deposit_paid: 'Abono recibido',
  paid: 'Pagado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#f59f00',
  deposit_paid: '#a78bfa',
  paid: '#6e8efb',
  delivered: '#2da44e',
  cancelled: '#e03131',
};

// ─── Shirt catalog & orders ───────────────────────────────────────────────────

export interface CatalogVariant {
  id: string;
  name: string;
  imageUrl: string;
  price?: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  requiresNumber: boolean;
  allowsCustomName: boolean;
  sizes: ShirtSize[];
  variants: CatalogVariant[];
}

export interface OrderItem extends Omit<OrderItemBase, 'size' | 'customName' | 'customNumber'> {
  size?: ShirtSize | null;
  customName?: string | null;
  customNumber?: number | null;
}

export interface Order extends Omit<OrderBase, 'notes'> {
  notes?: string | null;
  items: OrderItem[];
  user?: {
    id: string;
    name: string;
    username: string;
    phone: string;
    gender?: Gender | null;
  } | null;
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  banned: 'Baneado',
};

export const USER_STATUS_COLORS: Record<UserStatus, string> = {
  active: '#2da44e',
  inactive: '#7c8db5',
  banned: '#e03131',
};

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  scheduled: 'Programado',
  registration_open: 'Registro Abierto',
  in_progress: 'En Curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

// ─── Parser types (used by src/utils/parser.ts) ───────────────────────────────

export interface Player {
  id: string;
  position: number;
  name: string;
  note: string;
  attended: boolean;
  paid: boolean;
}

export interface ParseWarning {
  type: 'skipped_line' | 'duplicate_number' | 'empty_name' | 'gap_in_numbers';
  line: number;
  raw: string;
  message: string;
}

export interface ParseError {
  type: string;
  message: string;
}

export interface ParseResult {
  success: boolean;
  data?: { title: string; mainList: Player[]; waitList: Player[] };
  errors: ParseError[];
  warnings: ParseWarning[];
}

export interface GameList {
  id: string;
  title: string;
  rawMessage: string;
  createdAt: string;
  mainList: Player[];
  waitList: Player[];
}

// Exhaustive by type: adding an AuditAction in schema.prisma without a label
// here breaks the frontend typecheck instead of rendering a raw enum value.
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  player_registered: 'Jugador anotado',
  proxy_registered: 'Jugador anotado (por otro)',
  guest_registered: 'Invitado anotado',
  player_removed: 'Jugador eliminado',
  player_promoted: 'Jugador promovido',
  player_demoted: 'Jugador movido a espera',
  player_reordered: 'Lista reordenada',
  attendance_toggled: 'Asistencia marcada',
  payment_toggled: 'Pago marcado',
  note_updated: 'Nota actualizada',
  fine_exemption_toggled: 'Exención de multa',
  confirmation_requested: 'Confirmación solicitada',
  confirmation_received: 'Confirmación recibida',
  confirmation_expired: 'Confirmación expirada',
  game_created: 'Partido creado',
  game_updated: 'Partido actualizado',
  game_cancelled: 'Partido cancelado',
  game_completed: 'Partido completado',
  game_status_changed: 'Estado del partido cambiado',
  user_created: 'Usuario creado',
  user_updated: 'Usuario actualizado',
  user_status_changed: 'Estado de usuario cambiado',
  order_created: 'Pedido creado',
  order_updated: 'Pedido actualizado',
  order_status_changed: 'Estado de pedido cambiado',
  tournament_created: 'Torneo creado',
  tournament_updated: 'Torneo actualizado',
  tournament_status_changed: 'Estado del torneo cambiado',
  tournament_team_registered: 'Equipo inscrito en torneo',
  tournament_team_removed: 'Equipo eliminado del torneo',
  tournament_match_updated: 'Resultado del torneo actualizado',
};

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TournamentFormat =
  | 'league_and_knockout'
  | 'groups_and_knockout'
  | 'knockout_only';

export type GroupMatchFormat = 'two_sets_point_difference' | 'best_of_three';
export type StandingsTiebreaker =
  | 'wins'
  | 'setDifference'
  | 'pointDifference'
  | 'headToHead';

export interface CompetitionRulesV1 {
  version: 1;
  groupStage: {
    matchFormat: GroupMatchFormat;
    qualifiersPerGroup: number;
    standingsPoints: {
      straightWin: number;
      splitWin: number;
      splitLoss: number;
      straightLoss: number;
    };
    tiebreakers: StandingsTiebreaker[];
    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
  };
  knockoutStage: {
    matchFormat: 'best_of_three';
    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
    includeThirdPlace: boolean;
    pairingStrategy: 'high_low' | 'cross_group';
  };
}

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface TournamentPlayer {
  id: string;
  teamId: string;
  userId?: string;
  guestName?: string;
  isCaptain: boolean;
  user?: { id: string; name: string; phone: string };
}

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  name: string;
  paid: boolean;
  seed?: number;
  groupLabel?: string;
  registeredById: string;
  createdAt: string;
  players: TournamentPlayer[];
  registeredBy: { id: string; name: string };
}

export interface TournamentSet {
  id: string;
  matchId: string;
  setNumber: number;
  scoreA: number;
  scoreB: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  phase: string;
  groupLabel?: string;
  roundNumber: number;
  matchOrder: number;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  status: MatchStatus;
  scheduledAt?: string;
  court?: string;
  teamA?: { id: string; name: string };
  teamB?: { id: string; name: string };
  winner?: { id: string; name: string };
  sets: TournamentSet[];
}

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  modalidad: Modalidad;
  status: TournamentStatus;
  registrationOpenAt: string;
  startDate: string;
  endDate: string;
  pricePerTeam: number;
  prizeDescription?: string;
  maxTeams: number;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  minZetasMembers: number;
  allowExternalTeams: boolean;
  numberOfGroups?: number;
  competitionRules: CompetitionRulesV1;
  rules?: string;
  rulesFileUrl?: string;
  flyerUrl?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  createdBy: { id: string; name: string };
}

export type TournamentSummary = Pick<
  Tournament,
  | 'id' | 'name' | 'format' | 'modalidad' | 'status'
  | 'startDate' | 'endDate' | 'pricePerTeam' | 'prizeDescription'
  | 'maxTeams' | 'registrationOpenAt' | 'createdAt' | 'updatedAt'
  | 'createdBy'
> & { teams: { id: string; paid: boolean }[] };

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Borrador',
  registration_open: 'Inscripciones abiertas',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export const TOURNAMENT_STATUS_COLORS: Record<TournamentStatus, string> = {
  draft: '#7c8db5',
  registration_open: '#4caf50',
  in_progress: '#ff9800',
  completed: '#6e8efb',
  cancelled: '#e53935',
};

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  league_and_knockout: 'Liga + semifinales',
  groups_and_knockout: 'Fase de grupos + eliminación',
  knockout_only: 'Solo llaves (eliminación directa)',
};

export interface TeamStanding {
  teamId: string;
  teamName?: string;
  groupLabel: string;
  position: number;
  qualified: boolean;
  wins: number;
  losses: number;
  points: number;
  setsWon: number;
  setsLost: number;
  setDiff?: number;
  setDifference?: number;
  pointsScored: number;
  pointsConceded: number;
  pointDiff?: number;
  pointDifference?: number;
  resolvedBy?: StandingsTiebreaker | 'teamId';
}

export interface BracketPreviewTeam {
  id?: string;
  teamId?: string;
  name?: string;
  teamName?: string;
  seed?: number;
  groupLabel?: string;
  position?: number;
}

export interface BracketPreviewPair {
  teamA?: BracketPreviewTeam | null;
  teamB?: BracketPreviewTeam | null;
  teamAId?: string;
  teamBId?: string;
  seedA?: number;
  seedB?: number;
}

export interface BracketPreviewResponse {
  seeds?: BracketPreviewTeam[];
  seeding?: Array<string | BracketPreviewTeam>;
  firstRound: BracketPreviewPair[];
  totalRounds?: number;
  includeThirdPlace?: boolean;
}
