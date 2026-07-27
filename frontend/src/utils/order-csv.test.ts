import { describe, it, expect } from 'vitest';
import { buildCsv, buildProveedorCsv } from './order-csv';
import type { Order } from '../types';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pending',
    totalAmount: 90000,
    depositAmount: 45000,
    notes: null,
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:00:00.000Z',
    user: { id: 'user-1', name: 'Ana Ruiz', phone: '573001111111', gender: 'femenino' },
    items: [
      {
        id: 'item-1',
        productId: 'camiseta',
        productName: 'Camiseta',
        variantId: 'local',
        variantName: 'Local',
        size: 'M',
        quantity: 1,
        customName: 'ANA',
        customNumber: 7,
        unitPrice: 90000,
        lineTotal: 90000,
      },
    ],
    ...overrides,
  } as Order;
}

describe('buildCsv', () => {
  it('emite una fila por ítem con el estado en español', () => {
    const csv = buildCsv([makeOrder()]);
    const [header, row] = csv.split('\n');

    expect(header).toContain('"Pedido"');
    expect(row).toContain('"Ana Ruiz"');
    expect(row).toContain('"Pendiente"');
    expect(row).toContain('"ANA"');
  });

  it('escapa las comillas para no romper la fila', () => {
    const order = makeOrder({
      user: { id: 'u', name: 'Ana "La Muralla" Ruiz', phone: '1', gender: 'femenino' },
    } as Partial<Order>);

    expect(buildCsv([order]).split('\n')[1]).toContain('"Ana ""La Muralla"" Ruiz"');
  });

  it('devuelve solo el encabezado sin pedidos', () => {
    expect(buildCsv([]).split('\n')).toHaveLength(1);
  });
});

describe('buildProveedorCsv', () => {
  it('separa hombres y mujeres en columnas paralelas', () => {
    const fem = makeOrder({ id: 'o-f' });
    const masc = makeOrder({
      id: 'o-m',
      user: { id: 'u2', name: 'Luis Paz', phone: '2', gender: 'masculino' },
    } as Partial<Order>);

    const rows = buildProveedorCsv([fem, masc]).split('\n');

    expect(rows[0]).toContain('"masculino"');
    expect(rows[0]).toContain('"femenino"');
    // One data row, with the man on the left half and the woman on the right.
    expect(rows).toHaveLength(3);
    const cells = rows[2].split(',');
    expect(cells[2]).toBe('"ANA"');
    expect(cells[9]).toBe('"ANA"');
    expect(cells[5]).toBe('"M"');
    expect(cells[12]).toBe('"F"');
  });

  it('repite la fila una vez por unidad pedida', () => {
    const order = makeOrder();
    order.items[0].quantity = 3;

    // Header rows plus one line per shirt.
    expect(buildProveedorCsv([order]).split('\n')).toHaveLength(5);
  });
});
