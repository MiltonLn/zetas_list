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
}

export interface RegistrationUser {
  id: string;
  name: string;
  username: string;
  phone: string;
  position?: Position;
  gender?: Gender;
  photoUrl?: string;
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

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  scheduled: 'Programado',
  registration_open: 'Registro Abierto',
  in_progress: 'En Curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};
