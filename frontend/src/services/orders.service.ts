import { api } from './api';
import type { CatalogProduct, Order, OrderStatus, ShirtSize } from '../types';

export interface CreateOrderItemPayload {
  productId: string;
  variantId: string;
  size?: ShirtSize;
  quantity: number;
  customName?: string;
}

export interface CreateOrderPayload {
  shirtNumber?: number;
  notes?: string;
  items: CreateOrderItemPayload[];
}

export const ordersService = {
  catalog: () => api.get<CatalogProduct[]>('/orders/catalog'),

  myOrders: () => api.get<Order[]>('/orders/me'),

  create: (payload: CreateOrderPayload) => api.post<Order>('/orders', payload),

  list: (status?: OrderStatus) =>
    api.get<Order[]>('/orders', { params: status ? { status } : undefined }),

  updateStatus: (id: string, status: OrderStatus) =>
    api.patch<Order>(`/orders/${id}/status`, { status }),

  adminCreate: (targetUserId: string, payload: CreateOrderPayload) =>
    api.post<Order>(`/orders/admin/${targetUserId}`, payload),

  update: (id: string, payload: CreateOrderPayload) =>
    api.patch<Order>(`/orders/${id}`, payload),
};
