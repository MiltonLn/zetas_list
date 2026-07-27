export type Role = 'admin' | 'ayudante' | 'member';
export type UserStatus = 'active' | 'inactive' | 'banned';
export type Position = 'auxiliar' | 'libero' | 'armador' | 'central' | 'opuesto';
export type Gender = 'masculino' | 'femenino' | 'otro';
export type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export type OrderStatus = 'pending' | 'deposit_paid' | 'paid' | 'delivered' | 'cancelled';
export type Modalidad = 'seis_x_seis' | 'cuatro_x_cuatro';
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
  alias?: string;
  phone: string;
  role: Role;
  positions: Position[];
  /** Nivel de habilidad 0.0–5.0. Solo presente en respuestas para admins. */
  skillLevel?: number | null;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
  shirtSize?: ShirtSize;
  shirtNumber?: number;
  status: UserStatus;
  banReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  alias?: string;
  role: Role;
  phone: string;
  positions?: Position[];
  gender?: Gender;
  photoUrl?: string;
  mustChangePassword?: boolean;
}

export interface RegistrationUser {
  id: string;
  name: string;
  alias?: string;
  username: string;
  phone: string;
  positions?: Position[];
  skillLevel?: number | string | null;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
}

export interface GameRegistration {
  id: string;
  gameId: string;
  userId: string | null;
  position: number;
  isWaitingList: boolean;
  attended: boolean;
  paid: boolean;
  note?: string;
  fromWaitList: boolean;
  registeredAt: string;
  registeredById: string;
  isGuest: boolean;
  guestName?: string;
  pendingConfirmation: boolean;
  confirmationDeadline?: string;
  confirmationDeclined: boolean;
  originalWaitPosition?: number;
  teamNumber?: number | null;
  user: RegistrationUser;
  registeredBy: { id: string; name: string; alias?: string; username: string };
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
  guestCutoffTime: string;
  maxProxyRegistrations: number;
  mainListHasBeenFull: boolean;
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

export const SHIRT_SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

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

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  size?: ShirtSize | null;
  quantity: number;
  customName?: string | null;
  customNumber?: number | null;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user?: {
    id: string;
    name: string;
    username: string;
    phone: string;
    gender?: Gender | null;
  };
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

export const AUDIT_ACTION_LABELS: Record<string, string> = {
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
  order_status_changed: 'Estado de pedido cambiado',
  teams_generated: 'Equipos generados',
  teams_sent: 'Equipos enviados a WhatsApp',
};
