import { useEffect, useState } from 'react';
import { ordersService } from '../services/orders.service';
import type { Order, OrderStatus } from '../types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { AdminOrderFormModal } from '../components/AdminOrderFormModal';
import { formatCurrency } from '../utils/currency';


const STATUSES: OrderStatus[] = ['pending', 'deposit_paid', 'paid', 'delivered', 'cancelled'];

function buildProveedorCsv(orders: Order[]): string {
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

function buildCsv(orders: Order[]): string {
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

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<{ open: boolean; order?: Order }>({ open: false });

  useEffect(() => {
    setLoading(true);
    ordersService
      .list(filter || undefined)
      .then(({ data }) => setOrders(data))
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  async function changeStatus(id: string, status: OrderStatus) {
    setUpdatingId(id);
    setError('');
    try {
      const { data } = await ordersService.updateStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: data.status } : o)));
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setUpdatingId(null);
    }
  }

  function downloadCsv(content: string, filename: string) {
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    downloadCsv(buildCsv(orders), `pedidos-camisetas-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleSaved(saved: Order) {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setFormModal({ open: false });
  }

  function exportProveedorCsv() {
    downloadCsv(
      buildProveedorCsv(orders),
      `pedido-proveedor-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <>
      <PageHeader title="Pedidos de Camisetas" backTo="/" />

      <div className="page-wrapper">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ color: '#7c8db5', fontSize: 13 }}>Estado</label>
            <select
              className="zetas-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value as OrderStatus | '')}
              style={{ cursor: 'pointer', width: 'auto' }}
            >
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFormModal({ open: true })}
              style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}
            >
              + Nuevo pedido
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={orders.length === 0}
              style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}
            >
              Exportar CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={exportProveedorCsv}
              disabled={orders.length === 0}
              style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}
            >
              Formato proveedor
            </button>
          </div>
        </div>

        {error && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={40} />
          </div>
        ) : orders.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: '#7c8db5' }}>
            No hay pedidos {filter ? `en estado "${ORDER_STATUS_LABELS[filter]}"` : ''}.
          </div>
        ) : (
          <>
            <p style={{ color: '#7c8db5', fontSize: 13, marginTop: 0 }}>
              {orders.length} pedido(s) · Total {formatCurrency(totalAmount)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {orders.map((order) => (
                <div key={order.id} className="card" style={{ padding: 18 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ color: '#e8eaf6', fontSize: 15, fontWeight: 700 }}>
                        {order.user?.name ?? 'Usuario'}
                      </div>
                      <div style={{ color: '#7c8db5', fontSize: 12 }}>
                        {order.user?.phone ?? ''} · {new Date(order.createdAt).toLocaleDateString('es-CO')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: ORDER_STATUS_COLORS[order.status],
                          background: `${ORDER_STATUS_COLORS[order.status]}22`,
                          padding: '3px 10px',
                          borderRadius: 999,
                        }}
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <select
                        className="zetas-input"
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => changeStatus(order.id, e.target.value as OrderStatus)}
                        style={{ cursor: 'pointer', width: 'auto' }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setFormModal({ open: true, order })}
                        style={{ fontSize: 12, padding: '5px 12px', minHeight: 32 }}
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: '#7c8db5', textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px', fontWeight: 500 }}>Producto</th>
                        <th style={{ padding: '4px 8px', fontWeight: 500 }}>Talla</th>
                        <th style={{ padding: '4px 8px', fontWeight: 500 }}>#</th>
                        <th style={{ padding: '4px 8px', fontWeight: 500 }}>Nombre</th>
                        <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'center' }}>Cant.</th>
                        <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id} style={{ color: '#c5cae9' }}>
                          <td style={{ padding: '4px 8px' }}>
                            {item.productName} · {item.variantName}
                          </td>
                          <td style={{ padding: '4px 8px' }}>{item.size ?? '—'}</td>
                          <td style={{ padding: '4px 8px' }}>
                            {item.customNumber !== null && item.customNumber !== undefined
                              ? item.customNumber
                              : '—'}
                          </td>
                          <td style={{ padding: '4px 8px' }}>{item.customName ?? '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{formatCurrency(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {order.notes && (
                    <p style={{ color: '#7c8db5', fontSize: 12, margin: '10px 0 0' }}>
                      Nota: {order.notes}
                    </p>
                  )}
                  <div style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 700, textAlign: 'right', marginTop: 8 }}>
                    Total: {formatCurrency(order.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {formModal.open && (
        <AdminOrderFormModal
          order={formModal.order}
          onClose={() => setFormModal({ open: false })}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

// Default export as well so App.tsx can lazy-load it like every other page.
export default AdminOrdersPage;
