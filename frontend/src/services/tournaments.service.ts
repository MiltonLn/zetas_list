import { api } from './api';
import type {
  Tournament,
  TournamentSummary,
  TournamentStatus,
  TournamentFormat,
  Modalidad,
  TeamStanding,
} from '../types';

export interface CreateTournamentPayload {
  name: string;
  format: TournamentFormat;
  modalidad: Modalidad;
  registrationOpenAt: string;
  startDate: string;
  endDate: string;
  pricePerTeam?: number;
  prizeDescription?: string;
  maxTeams: number;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  minZetasMembers?: number;
  allowExternalTeams?: boolean;
  numberOfGroups?: number;
  rules?: string;
  rulesFileUrl?: string;
  flyerUrl?: string;
}

export interface TeamPlayerPayload {
  userId?: string;
  guestName?: string;
  isCaptain?: boolean;
}

export interface RegisterTeamPayload {
  name: string;
  players: TeamPlayerPayload[];
}

export const tournamentsService = {
  list: (status?: TournamentStatus) =>
    api.get<TournamentSummary[]>('/tournaments', {
      params: status ? { status } : undefined,
    }),

  findOne: (id: string) => api.get<Tournament>(`/tournaments/${id}`),

  create: (payload: CreateTournamentPayload) =>
    api.post<Tournament>('/tournaments', payload),

  update: (id: string, payload: Partial<CreateTournamentPayload>) =>
    api.patch<Tournament>(`/tournaments/${id}`, payload),

  openRegistration: (id: string) =>
    api.post<Tournament>(`/tournaments/${id}/open-registration`),

  start: (id: string) => api.post<Tournament>(`/tournaments/${id}/start`),

  complete: (id: string) => api.post<Tournament>(`/tournaments/${id}/complete`),

  cancel: (id: string) => api.post<Tournament>(`/tournaments/${id}/cancel`),

  registerTeam: (tournamentId: string, payload: RegisterTeamPayload) =>
    api.post<Tournament['teams'][0]>(`/tournaments/${tournamentId}/teams`, payload),

  removeTeam: (tournamentId: string, teamId: string) =>
    api.delete(`/tournaments/${tournamentId}/teams/${teamId}`),

  updateTeamPayment: (tournamentId: string, teamId: string, paid: boolean) =>
    api.patch(`/tournaments/${tournamentId}/teams/${teamId}/payment`, { paid }),

  getStandings: (tournamentId: string) =>
    api.get<TeamStanding[]>(`/tournaments/${tournamentId}/standings`),

  assignGroups: (tournamentId: string, assignments?: Record<string, string>) =>
    api.post<Tournament>(`/tournaments/${tournamentId}/assign-groups`, { assignments }),

  generateGroupMatches: (tournamentId: string) =>
    api.post<Tournament>(`/tournaments/${tournamentId}/generate-matches`),

  generateKnockoutBracket: (tournamentId: string, seeding?: string[]) =>
    api.post<Tournament>(`/tournaments/${tournamentId}/generate-bracket`, { seeding }),

  advanceWinners: (tournamentId: string) =>
    api.post<Tournament>(`/tournaments/${tournamentId}/advance-winners`),

  uploadRulesPdf: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Tournament>(`/tournaments/${id}/rules-pdf`, form);
  },

  uploadFlyer: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Tournament>(`/tournaments/${id}/flyer`, form);
  },

  cancelMatch: (matchId: string) =>
    api.patch(`/tournaments/matches/${matchId}/cancel`),

  updateMatchScore: (
    matchId: string,
    sets: { setNumber: number; scoreA: number; scoreB: number }[],
  ) => api.patch(`/tournaments/matches/${matchId}`, { sets }),
};
