import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  financesService,
  type CreateFinePayload,
  type CreateTransactionPayload,
  type ImportPayload,
  type UpdateFinePayload,
  type UpdateTransactionPayload,
} from '../services/finances.service';
import {
  queryKeys,
  type FinanceTransactionType,
  type FineStatusFilter,
} from '../lib/query-client';

export function useFinancesDashboardQuery(year?: number) {
  return useQuery({
    queryKey: queryKeys.financesDashboard(year),
    queryFn: async () => (await financesService.getDashboard(year)).data,
  });
}

export function useTransactionsQuery(year?: number, type?: FinanceTransactionType) {
  return useQuery({
    queryKey: queryKeys.financesTransactions(year, type),
    queryFn: async () => (await financesService.getTransactions(year, type)).data,
  });
}

export function useFinesQuery(year?: number, status?: FineStatusFilter) {
  return useQuery({
    queryKey: queryKeys.financesFines(year, status),
    queryFn: async () => (await financesService.getFines(year, status)).data,
  });
}

export function useMyFinesQuery() {
  return useQuery({
    queryKey: queryKeys.financesMyFines,
    queryFn: async () => (await financesService.getMyFines()).data,
  });
}

function useInvalidateFinances() {
  const queryClient = useQueryClient();
  return async () => queryClient.invalidateQueries({ queryKey: queryKeys.financesRoot });
}

export function useSaveTransactionMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'update'; transactionId: string; payload: UpdateTransactionPayload }
        | { kind: 'create'; payload: CreateTransactionPayload },
    ) =>
      input.kind === 'update'
        ? (await financesService.updateTransaction(input.transactionId, input.payload)).data
        : (await financesService.createTransaction(input.payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteTransactionMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (id: string) => financesService.deleteTransaction(id),
    onSuccess: invalidate,
  });
}

export function useSaveFineMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'update'; fineId: string; payload: UpdateFinePayload }
        | { kind: 'create'; payload: CreateFinePayload },
    ) =>
      input.kind === 'update'
        ? (await financesService.updateFine(input.fineId, input.payload)).data
        : (await financesService.createFine(input.payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteFineMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (id: string) => financesService.deleteFine(id),
    onSuccess: invalidate,
  });
}

export function useMarkFinePaidMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (id: string) =>
      (await financesService.updateFine(id, { status: 'paid' })).data,
    onSuccess: invalidate,
  });
}

export function useImportFinancesMutation() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: async (payload: ImportPayload) => (await financesService.importData(payload)).data,
    onSuccess: invalidate,
  });
}
