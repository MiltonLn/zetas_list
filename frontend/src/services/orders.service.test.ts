import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';
import { ordersService } from './orders.service';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

describe('ordersService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('catalog llama GET /orders/catalog', async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    await ordersService.catalog();
    expect(mockApi.get).toHaveBeenCalledWith('/orders/catalog');
  });

  it('myOrders llama GET /orders/me', async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    await ordersService.myOrders();
    expect(mockApi.get).toHaveBeenCalledWith('/orders/me');
  });

  it('create llama POST /orders con el payload', async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    const payload = {
      shirtNumber: 7,
      items: [{ productId: 'camiseta', variantId: 'local', size: 'M' as const, quantity: 1 }],
    };
    await ordersService.create(payload);
    expect(mockApi.post).toHaveBeenCalledWith('/orders', payload);
  });

  it('list reenvía el filtro de estado', async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    await ordersService.list('pending');
    expect(mockApi.get).toHaveBeenCalledWith('/orders', { params: { status: 'pending' } });
  });

  it('list sin estado no envía params', async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    await ordersService.list();
    expect(mockApi.get).toHaveBeenCalledWith('/orders', { params: undefined });
  });

  it('updateStatus llama PATCH /orders/:id/status', async () => {
    mockApi.patch.mockResolvedValue({ data: {} });
    await ordersService.updateStatus('o1', 'paid');
    expect(mockApi.patch).toHaveBeenCalledWith('/orders/o1/status', { status: 'paid' });
  });
});
