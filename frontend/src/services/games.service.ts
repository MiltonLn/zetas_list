import { api } from './api';
import type { Game, GameStatus, Modalidad, AuditLog } from '../types';

export interface CreateGamePayload {
  modalidad: Modalidad;
  gameDate: string;
  startTime?: string;
  registrationOpenTime?: string;
  pricePerPlayer?: number;
  vigilante?: number;
  maxMainSpots?: number;
  customTitle?: string;
}

export interface ListGamesParams {
  status?: GameStatus;
  excludeStatus?: string;
  modalidad?: Modalidad;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedGames {
  data: Game[];
  total: number;
  page: number;
  limit: number;
}

export const gamesService = {
  list: (params?: ListGamesParams) =>
    api.get<PaginatedGames>('/games', { params }),

  get: (id: string) => api.get<Game>(`/games/${id}`),

  create: (payload: CreateGamePayload) => api.post<Game>('/games', payload),

  register: (gameId: string) => api.post(`/games/${gameId}/register`),

  registerUser: (gameId: string, userId: string) =>
    api.post(`/games/${gameId}/register/${userId}`),

  removeRegistration: (gameId: string, userId: string) =>
    api.delete(`/games/${gameId}/register/${userId}`),

  updateRegistration: (
    gameId: string,
    regId: string,
    data: { attended?: boolean; paid?: boolean; note?: string },
  ) => api.patch(`/games/${gameId}/registrations/${regId}`, data),

  promote: (gameId: string, regId: string) =>
    api.post(`/games/${gameId}/promote/${regId}`),

  demote: (gameId: string, regId: string) =>
    api.post(`/games/${gameId}/demote/${regId}`),

  reorder: (gameId: string, mainList: string[], waitList: string[]) =>
    api.patch(`/games/${gameId}/reorder`, { mainList, waitList }),

  cancel: (gameId: string, reason: string) =>
    api.post(`/games/${gameId}/cancel`, { reason }),

  complete: (gameId: string) => api.post(`/games/${gameId}/complete`),

  previewReport: (gameId: string) =>
    api.get<{
      report: string;
      fineable: Array<{ regId: string; userId: string; name: string; fineExempt: boolean }>;
    }>(`/games/${gameId}/preview-report`),

  setFineExempt: (gameId: string, regId: string, exempt: boolean) =>
    api.patch(`/games/${gameId}/registrations/${regId}/fine-exempt`, { exempt }),

  getReport: (gameId: string) =>
    api.get<{ report: string }>(`/games/${gameId}/report`),

  getAudit: (gameId: string) => api.get<AuditLog[]>(`/games/${gameId}/audit`),
};
