import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { AdminOrderFormModal } from '../components/AdminOrderFormModal';
import { buildCsv, buildProveedorCsv } from '../utils/order-csv';
import { formatCurrency } from '../utils/currency';
import { useAdminOrdersQuery, useUpdateOrderStatusMutation } from '../hooks/useOrdersQuery';
import { showToast } from '../utils/toast';

const STATUSES: OrderStatus[] = ['pending', 'deposit_paid', 'paid', 'delivered', 'cancelled'];

export function AdminOrdersPage() {
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [formModal, setFormModal] = useState<{ open: boolean; order?: Order }>({ open: false });
  const ordersQuery = useAdminOrdersQuery(filter || undefined);
  const updateStatus = useUpdateOrderStatusMutation();
  const orders = ordersQuery.data ?? [];

  useEffect(() => {
    if (ordersQuery.error) showToast(getApiError(ordersQuery.error), 'error');
  }, [ordersQuery.error]);

  async function changeStatus(id: string, status: OrderStatus) {
    try {
      await updateStatus.mutateAsync({ id, status });
    } catch (e) {
      showToast(getApiError(e), 'error');
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

  function handleSaved() {
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

        {ordersQuery.isPending ? (
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
                        disabled={updateStatus.isPending && updateStatus.variables?.id === order.id}
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
