import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-client';
import {
  usersService,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../services/users.service';
import type { Role, UserStatus } from '../types';

export function useUsersQuery(search?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.usersList(search),
    queryFn: async () => (await usersService.list(search)).data,
    enabled,
  });
}

export function useUserQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user(id ?? ''),
    queryFn: async () => (await usersService.get(id!)).data,
    enabled: !!id,
  });
}

export function useMeQuery() {
  return useQuery({
    queryKey: queryKeys.userMe,
    queryFn: async () => (await usersService.me()).data,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return async (id?: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.usersRoot });
    if (id) await queryClient.invalidateQueries({ queryKey: queryKeys.user(id) });
  };
}

export function useCreateUserMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => (await usersService.create(payload)).data,
    onSuccess: async (user) => invalidate(user.id),
  });
}

export function useUpdateUserMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      (await usersService.update(id, payload)).data,
    onSuccess: async (user) => invalidate(user.id),
  });
}

export function useUpdateUserStatusMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: UserStatus;
      reason?: string;
    }) => (await usersService.updateStatus(id, status, reason)).data,
    onSuccess: async (user) => invalidate(user.id),
  });
}

export function useUpdateUserRoleMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) =>
      (await usersService.updateRole(id, role)).data,
    onSuccess: async (user) => invalidate(user.id),
  });
}

export function useUploadUserPhotoMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) =>
      (await usersService.uploadPhoto(id, file)).data,
    onSuccess: async (user) => invalidate(user.id),
  });
}
