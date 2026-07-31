import type { Order } from '../types';
import { ORDER_STATUS_LABELS } from '../types';

export function buildProveedorCsv(orders: Order[]): string {
  type ProveedorRow = {
    producto: string;
    nombre: string;
    numero: string;
    talla: string;
    genero: string;
    observacion: string;
  };

  const masc: ProveedorRow[] = [];
  const fem: ProveedorRow[] = [];

  for (const order of orders) {
    const isFem = order.user?.gender === 'femenino';
    const genLabel = isFem ? 'F' : 'M';
    const list = isFem ? fem : masc;

    for (const item of order.items) {
      const count = item.quantity ?? 1;
      for (let u = 0; u < count; u++) {
        list.push({
          producto: [item.productName, item.variantName].filter(Boolean).join(' '),
          nombre: item.customName ?? order.user?.name ?? '',
          numero: item.customNumber != null ? String(item.customNumber) : '',
          talla: item.size ?? '',
          genero: genLabel,
          observacion: order.notes ?? '',
        });
      }
    }
  }

  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows: string[] = [
    ['masculino', '', '', '', '', '', '', 'femenino', '', '', '', '', '', ''].map(escape).join(','),
    [
      'CONSECUTIVO N°', 'PRODUCTO', 'NOMBRE', 'NUMERO', 'TALLA', 'GENERO F/M', 'OBSERVACIÓN',
      'CONSECUTIVO N°', 'PRODUCTO', 'NOMBRE', 'NUMERO', 'TALLA', 'GENERO F/M', 'OBSERVACIÓN',
    ]
      .map(escape)
      .join(','),
  ];

  const total = Math.max(masc.length, fem.length);
  for (let i = 0; i < total; i++) {
    const m = masc[i];
    const f = fem[i];
    rows.push(
      [
        m ? i + 1 : '',
        m?.producto ?? '',
        m?.nombre ?? '',
        m?.numero ?? '',
        m?.talla ?? '',
        m?.genero ?? '',
        m?.observacion ?? '',
        f ? i + 1 : '',
        f?.producto ?? '',
        f?.nombre ?? '',
        f?.numero ?? '',
        f?.talla ?? '',
        f?.genero ?? '',
        f?.observacion ?? '',
      ]
        .map(escape)
        .join(','),
    );
  }

  return rows.join('\n');
}

export function buildCsv(orders: Order[]): string {
  const header = [
    'Pedido',
    'Fecha',
    'Usuario',
    'Teléfono',
    'Estado',
    'Producto',
    'Modelo',
    'Talla',
    'Número',
    'Nombre',
    'Cantidad',
    'Subtotal',
    'Total pedido',
  ];

  const escape = (value: string | number | null | undefined) => {
    const s = value === null || value === undefined ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows: string[] = [header.map(escape).join(',')];
  for (const order of orders) {
    for (const item of order.items) {
      rows.push(
        [
          order.id,
          new Date(order.createdAt).toLocaleDateString('es-CO'),
          order.user?.name ?? '',
          order.user?.phone ?? '',
          ORDER_STATUS_LABELS[order.status],
          item.productName,
          item.variantName,
          item.size ?? '',
          item.customNumber ?? '',
          item.customName ?? '',
          item.quantity,
          item.lineTotal,
          order.totalAmount,
        ]
          .map(escape)
          .join(','),
      );
    }
  }
  return rows.join('\n');
}
