import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-client';
import { ordersService, type CreateOrderPayload } from '../services/orders.service';
import type { OrderStatus } from '../types';

export function useOrdersCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.ordersCatalog,
    queryFn: async () => (await ordersService.catalog()).data,
  });
}

export function useMyOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.ordersMine,
    queryFn: async () => (await ordersService.myOrders()).data,
  });
}

export function useAdminOrdersQuery(status?: OrderStatus) {
  return useQuery({
    queryKey: queryKeys.ordersAdmin(status),
    queryFn: async () => (await ordersService.list(status)).data,
  });
}

function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return async (catalogChanged = false) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersMine }),
      queryClient.invalidateQueries({ queryKey: ['orders', 'admin'] }),
      ...(catalogChanged
        ? [queryClient.invalidateQueries({ queryKey: queryKeys.ordersCatalog })]
        : []),
    ]);
  };
}

export function useCreateOrderMutation() {
  const invalidate = useInvalidateOrders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) => (await ordersService.create(payload)).data,
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: queryKeys.userMe }),
      ]);
    },
  });
}

export function useSaveAdminOrderMutation() {
  const invalidate = useInvalidateOrders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'update'; orderId: string; payload: CreateOrderPayload }
        | { kind: 'create'; targetUserId: string; payload: CreateOrderPayload },
    ) =>
      input.kind === 'update'
        ? (await ordersService.update(input.orderId, input.payload)).data
        : (await ordersService.adminCreate(input.targetUserId, input.payload)).data,
    onSuccess: async (order, input) => {
      const userId = input.kind === 'create' ? input.targetUserId : order.userId;
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: queryKeys.usersRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user(userId) }),
      ]);
    },
  });
}

export function useUpdateOrderStatusMutation() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) =>
      (await ordersService.updateStatus(id, status)).data,
    onSuccess: async () => invalidate(),
  });
}
