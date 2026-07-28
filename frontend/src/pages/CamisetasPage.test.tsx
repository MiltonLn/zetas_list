import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CamisetasPage from './CamisetasPage';
import { ordersService } from '../services/orders.service';
import { usersService } from '../services/users.service';
import type { CatalogProduct } from '../types';
import { renderWithQueryClient } from '../test/query-wrapper';

vi.mock('../services/orders.service', () => ({
  ordersService: {
    catalog: vi.fn(),
    myOrders: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../services/users.service', () => ({
  usersService: { me: vi.fn() },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Juan', username: 'juan', role: 'member', phone: '300' } }),
}));

const camiseta: CatalogProduct = {
  id: 'camiseta',
  name: 'Camiseta',
  description: 'Camiseta oficial',
  price: 55000,
  requiresNumber: true,
  allowsCustomName: true,
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  variants: [
    { id: 'local', name: 'Local', imageUrl: '/camisetas/camiseta-local.svg' },
    { id: 'visitante', name: 'Visitante', imageUrl: '/camisetas/camiseta-visitante.svg' },
  ],
};

const pantaloneta: CatalogProduct = {
  id: 'pantaloneta',
  name: 'Pantaloneta',
  description: 'Pantaloneta deportiva',
  price: 40000,
  requiresNumber: false,
  allowsCustomName: false,
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  variants: [{ id: 'estandar', name: 'Estándar', imageUrl: '/camisetas/pantaloneta.svg' }],
};

const mockOrders = vi.mocked(ordersService);
const mockUsers = vi.mocked(usersService);

function renderPage() {
  return renderWithQueryClient(
    <MemoryRouter>
      <CamisetasPage />
    </MemoryRouter>,
  );
}

describe('CamisetasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.me.mockResolvedValue({ data: { shirtNumber: 5 } } as never);
    mockOrders.myOrders.mockResolvedValue({ data: [] } as never);
    mockOrders.create.mockResolvedValue({ data: { id: 'o1' } } as never);
  });

  it('muestra los productos del catálogo', async () => {
    mockOrders.catalog.mockResolvedValue({ data: [camiseta, pantaloneta] } as never);
    renderPage();

    expect(await screen.findByText('Camiseta')).toBeInTheDocument();
    expect(screen.getByText('Pantaloneta')).toBeInTheDocument();
  });

  it('prellena el número de camiseta desde el perfil', async () => {
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    const numberInput = screen.getByPlaceholderText('Ej. 7') as HTMLInputElement;
    expect(numberInput.value).toBe('5');
  });

  it('abre el modal de configuración al tocar un producto', async () => {
    const user = userEvent.setup();
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    // Antes de abrir el modal no hay selects de configuración.
    expect(screen.queryByRole('button', { name: 'Agregar al pedido' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Camiseta' }));

    expect(screen.getByRole('button', { name: 'Agregar al pedido' })).toBeInTheDocument();
    expect(screen.getByText('Camiseta oficial')).toBeInTheDocument();
  });

  it('cierra el modal con el botón Cancelar sin agregar nada', async () => {
    const user = userEvent.setup();
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Camiseta' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('button', { name: 'Agregar al pedido' })).not.toBeInTheDocument();
    expect(screen.getByText('Aún no has agregado artículos.')).toBeInTheDocument();
  });

  it('agrega un artículo desde el modal, calcula el total y envía el pedido', async () => {
    const user = userEvent.setup();
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Camiseta' }));

    // comboboxes del modal: [0] variante, [1] talla
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'M');

    await user.click(screen.getByRole('button', { name: 'Agregar al pedido' }));

    // El modal se cierra al agregar.
    expect(screen.queryByRole('button', { name: 'Agregar al pedido' })).not.toBeInTheDocument();

    // total = 55000 (aparece en la línea y en el total)
    expect((await screen.findAllByText('$55.000')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));

    await waitFor(() => expect(mockOrders.create).toHaveBeenCalledTimes(1));
    const payload = mockOrders.create.mock.calls[0][0];
    expect(payload.shirtNumber).toBe(5);
    expect(payload.items).toEqual([
      expect.objectContaining({ productId: 'camiseta', variantId: 'local', size: 'M', quantity: 1 }),
    ]);
  });

  it('exige talla dentro del modal antes de agregar', async () => {
    const user = userEvent.setup();
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Camiseta' }));
    await user.click(screen.getByRole('button', { name: 'Agregar al pedido' }));

    expect(await screen.findByText('Selecciona una talla')).toBeInTheDocument();
    // El modal sigue abierto y no se agregó nada.
    expect(screen.getByRole('button', { name: 'Agregar al pedido' })).toBeInTheDocument();
  });

  it('muestra el abono del 50% y la llave Bre-b al agregar un artículo', async () => {
    const user = userEvent.setup();
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Camiseta' }));
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'M');
    await user.click(screen.getByRole('button', { name: 'Agregar al pedido' }));

    expect(await screen.findByText('Abono ahora (50%)')).toBeInTheDocument();
    expect(screen.getByText('Saldo pendiente')).toBeInTheDocument();
    // 55000 / 2 = 27500 (abono y saldo)
    expect(screen.getAllByText('$27.500').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('@MLR608')).toBeInTheDocument();
  });

  it('exige número cuando el carrito tiene camisetas', async () => {
    const user = userEvent.setup();
    mockUsers.me.mockResolvedValue({ data: {} } as never);
    mockOrders.catalog.mockResolvedValue({ data: [camiseta] } as never);
    renderPage();

    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Camiseta' }));
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'M');
    await user.click(screen.getByRole('button', { name: 'Agregar al pedido' }));
    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));

    expect(await screen.findByText('Debes indicar tu número de camiseta')).toBeInTheDocument();
    expect(mockOrders.create).not.toHaveBeenCalled();
  });
});
