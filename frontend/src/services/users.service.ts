import { api } from './api';
import type { User, Role, Position, Gender, UserStatus } from '../types';

export interface CreateUserPayload {
  username?: string;
  password?: string;
  name: string;
  phone: string;
  role?: Role;
  position?: Position;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
}

export interface UpdateUserPayload {
  name?: string;
  position?: Position;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
}

export const usersService = {
  list: (search?: string) =>
    api.get<User[]>('/users', { params: search ? { search } : undefined }),

  get: (id: string) => api.get<User>(`/users/${id}`),

  me: () => api.get<User>('/users/me'),

  create: (payload: CreateUserPayload) => api.post<User>('/users', payload),

  update: (id: string, payload: UpdateUserPayload) =>
    api.patch<User>(`/users/${id}`, payload),

  updateStatus: (id: string, status: UserStatus, reason?: string) =>
    api.patch(`/users/${id}/status`, { status, reason }),

  updateRole: (id: string, role: Role) =>
    api.patch<User>(`/users/${id}/role`, { role }),

  resetPassword: (id: string, newPassword: string) =>
    api.patch(`/users/${id}/reset-password`, { newPassword }),

  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<User>(`/users/${id}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
