import { api } from './api';
import type {
  FinanceTransactionBase,
  FineBase,
  FineStatus,
  TransactionType,
} from '../types';

export interface DashboardData {
  year: number;
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  totalFinesPaid: number;
  pendingFines: PendingFine[];
}

export interface PendingFine {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  reason: string;
  date: string;
}

export interface FinanceTransaction extends FinanceTransactionBase {
  createdBy?: { id: string; name: string };
}

export interface Fine extends FineBase {
  user?: { id: string; name: string; phone: string } | null;
  createdBy?: { id: string; name: string };
}

export interface CreateTransactionPayload {
  type: TransactionType;
  date: string;
  amount: number;
  description: string;
  gameId?: string;
}

export interface UpdateTransactionPayload {
  type?: TransactionType;
  date?: string;
  amount?: number;
  description?: string;
}

export interface CreateFinePayload {
  userId: string;
  date: string;
  amount: number;
  reason: string;
  status?: FineStatus;
  gameId?: string;
}

export interface UpdateFinePayload {
  userId?: string | null;
  date?: string;
  amount?: number;
  reason?: string;
  status?: FineStatus;
}

export interface ImportPayload {
  transactions: {
    type: TransactionType;
    date: string;
    amount: number;
    description: string;
  }[];
  fines: {
    userPhone: string;
    date: string;
    amount: number;
    reason: string;
    status?: FineStatus;
  }[];
}

export interface ImportResult {
  transactionsCreated: number;
  finesCreated: number;
  errors: string[];
}

export interface MyFinesResult {
  fines: Fine[];
  total: number;
}

export const financesService = {
  getDashboard: (year?: number) =>
    api.get<DashboardData>('/finances/dashboard', { params: year ? { year } : undefined }),

  getTransactions: (year?: number, type?: TransactionType) =>
    api.get<FinanceTransaction[]>('/finances/transactions', { params: { ...(year ? { year } : {}), ...(type ? { type } : {}) } }),

  getFines: (year?: number, status?: FineStatus) =>
    api.get<Fine[]>('/finances/fines', { params: { ...(year ? { year } : {}), ...(status ? { status } : {}) } }),

  getMyFines: () =>
    api.get<MyFinesResult>('/finances/my-fines'),

  createTransaction: (payload: CreateTransactionPayload) =>
    api.post<FinanceTransaction>('/finances/transactions', payload),

  updateTransaction: (id: string, payload: UpdateTransactionPayload) =>
    api.patch<FinanceTransaction>(`/finances/transactions/${id}`, payload),

  deleteTransaction: (id: string) =>
    api.delete(`/finances/transactions/${id}`),

  createFine: (payload: CreateFinePayload) =>
    api.post<Fine>('/finances/fines', payload),

  updateFine: (id: string, payload: UpdateFinePayload) =>
    api.patch<Fine>(`/finances/fines/${id}`, payload),

  deleteFine: (id: string) =>
    api.delete(`/finances/fines/${id}`),

  importData: (payload: ImportPayload) =>
    api.post<ImportResult>('/finances/import', payload),
};
