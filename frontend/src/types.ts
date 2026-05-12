export type Role = 'admin' | 'member';
export type UserStatus = 'active' | 'inactive' | 'banned';
export type Position = 'auxiliar' | 'libero' | 'armador' | 'central' | 'opuesto';
export type Gender = 'masculino' | 'femenino' | 'otro';
export type Modalidad = 'seis_x_seis' | 'cuatro_x_cuatro' | 'torneo';
export type GameStatus =
  | 'scheduled'
  | 'registration_open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  role: Role;
  position?: Position;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
  status: UserStatus;
  banReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone: string;
  position?: Position;
  gender?: Gender;
  photoUrl?: string;
  mustChangePassword?: boolean;
}

export interface RegistrationUser {
  id: string;
  name: string;
  username: string;
  phone: string;
  position?: Position;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
}

export interface GameRegistration {
  id: string;
  gameId: string;
  userId: string;
  position: number;
  isWaitingList: boolean;
  attended: boolean;
  paid: boolean;
  note?: string;
  fromWaitList: boolean;
  registeredAt: string;
  registeredById: string;
  user: RegistrationUser;
  registeredBy: { id: string; name: string; username: string };
}

export interface Game {
  id: string;
  title: string;
  modalidad: Modalidad;
  gameDate: string;
  startTime: string;
  registrationOpenAt: string;
  maxMainSpots: number;
  pricePerPlayer: number;
  vigilante: number;
  status: GameStatus;
  cancellationReason?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  registrations: GameRegistration[];
  createdBy?: { id: string; name: string };
  _count?: { registrations: number };
}

export interface AuditLog {
  id: string;
  gameId?: string;
  actorId: string;
  targetUserId?: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; username: string };
  targetUser?: { id: string; name: string; username: string };
}

export const MODALIDAD_LABELS: Record<Modalidad, string> = {
  seis_x_seis: '6x6',
  cuatro_x_cuatro: '4x4',
  torneo: 'Torneo',
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

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  player_registered: 'Jugador anotado',
  player_removed: 'Jugador eliminado',
  player_promoted: 'Jugador promovido',
  player_reordered: 'Lista reordenada',
  attendance_toggled: 'Asistencia marcada',
  payment_toggled: 'Pago marcado',
  note_updated: 'Nota actualizada',
  game_created: 'Partido creado',
  game_updated: 'Partido actualizado',
  game_cancelled: 'Partido cancelado',
  game_completed: 'Partido completado',
  game_status_changed: 'Estado del partido cambiado',
  user_created: 'Usuario creado',
  user_updated: 'Usuario actualizado',
  user_status_changed: 'Estado de usuario cambiado',
};
