import { api } from './api';
import type { AuthUser } from '../types';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const authService = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { username, password }),

  refresh: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),

  recoverPassword: (username: string) =>
    api.post<{ message: string }>('/auth/recover-password', { username }),

  me: () => api.get<AuthUser>('/auth/me'),
};
