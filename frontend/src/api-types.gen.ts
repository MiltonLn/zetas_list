// AUTOGENERADO — no editar a mano.
// Fuente: backend/prisma/schema.prisma
// Regenerar con: npm run gen:api-types (o `make gen-types`)

export const ROLE_VALUES = [
  'admin',
  'ayudante',
  'member',
] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const USER_STATUS_VALUES = [
  'active',
  'inactive',
  'banned',
] as const;
export type UserStatus = (typeof USER_STATUS_VALUES)[number];

export const POSITION_VALUES = [
  'auxiliar',
  'libero',
  'armador',
  'central',
  'opuesto',
] as const;
export type Position = (typeof POSITION_VALUES)[number];

export const GENDER_VALUES = [
  'masculino',
  'femenino',
  'otro',
] as const;
export type Gender = (typeof GENDER_VALUES)[number];

export const SHIRT_SIZE_VALUES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
] as const;
export type ShirtSize = (typeof SHIRT_SIZE_VALUES)[number];

export const ORDER_STATUS_VALUES = [
  'pending',
  'deposit_paid',
  'paid',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export const MODALIDAD_VALUES = [
  'seis_x_seis',
  'cuatro_x_cuatro',
] as const;
export type Modalidad = (typeof MODALIDAD_VALUES)[number];

export const GAME_STATUS_VALUES = [
  'scheduled',
  'registration_open',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type GameStatus = (typeof GAME_STATUS_VALUES)[number];

export const AUDIT_ACTION_VALUES = [
  'player_registered',
  'player_removed',
  'player_promoted',
  'player_demoted',
  'player_reordered',
  'attendance_toggled',
  'payment_toggled',
  'note_updated',
  'game_created',
  'game_updated',
  'game_cancelled',
  'game_completed',
  'game_status_changed',
  'user_created',
  'user_updated',
  'user_status_changed',
  'fine_exemption_toggled',
  'guest_registered',
  'proxy_registered',
  'confirmation_requested',
  'confirmation_received',
  'confirmation_expired',
  'order_created',
  'order_updated',
  'order_status_changed',
] as const;
export type AuditAction = (typeof AUDIT_ACTION_VALUES)[number];

export const TRANSACTION_TYPE_VALUES = [
  'income',
  'expense',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPE_VALUES)[number];

export const FINE_STATUS_VALUES = [
  'pending',
  'paid',
] as const;
export type FineStatus = (typeof FINE_STATUS_VALUES)[number];
