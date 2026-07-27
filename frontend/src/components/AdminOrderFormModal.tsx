import { useEffect, useState } from 'react';
import { ordersService, type CreateOrderItemPayload } from '../services/orders.service';
import { usersService } from '../services/users.service';
import type { CatalogProduct, Order, ShirtSize, User } from '../types';
import { getApiError } from '../services/api';
import { Spinner } from './Spinner';
import { formatCurrency } from '../utils/currency';

interface CartLine {
  key: number;
  productId: string;
  variantId: string;
  size: ShirtSize | '';
  /** Kept as string so the input field can be cleared while the user is typing. */
  quantityStr: string;
  customName: string;
}

interface Props {
  /** Pedido existente para editar; undefined = crear uno nuevo. */
  order?: Order;
  onClose: () => void;
  onSaved: (saved: Order) => void;
}

let keySeq = 0;
const nextKey = () => ++keySeq;

function emptyLine(): CartLine {
  return { key: nextKey(), productId: '', variantId: '', size: '', quantityStr: '1', customName: '' };
}


export function AdminOrderFormModal({ order, onClose, onSaved }: Props) {
  const isEdit = !!order;

  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(!isEdit);

  const [targetUserId, setTargetUserId] = useState(order?.userId ?? '');
  const [shirtNumber, setShirtNumber] = useState<string>(
    order?.items.find((i) => i.customNumber != null)?.customNumber?.toString() ?? '',
  );
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<CartLine[]>(() => {
    if (!order || order.items.length === 0) return [emptyLine()];
    return order.items.map((item) => ({
      key: nextKey(),
      productId: item.productId,
      variantId: item.variantId,
      size: (item.size as ShirtSize | null) ?? '',
      quantityStr: String(item.quantity),
      customName: item.customName ?? '',
    }));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ordersService
      .catalog()
      .then(({ data }) => setCatalog(data))
      .catch(() => {})
      .finally(() => setLoadingCatalog(false));

    if (!isEdit) {
      usersService
        .list()
        .then(({ data }) => setUsers(data))
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [isEdit]);

  function getProduct(id: string) {
    return catalog.find((p) => p.id === id);
  }

  function updateLine(key: number, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        if (patch.productId !== undefined) {
          const prod = getProduct(patch.productId);
          updated.variantId = prod?.variants[0]?.id ?? '';
          updated.size = '';
          updated.quantityStr = '1';
          updated.customName = '';
        }
        return updated;
      }),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  const requiresNumber = lines.some((l) => getProduct(l.productId)?.requiresNumber);
  const totalAmount = lines.reduce((sum, l) => {
    const prod = getProduct(l.productId);
    if (!prod) return sum;
    const variant = prod.variants.find((v) => v.id === l.variantId);
    const price = variant?.price ?? prod.price;
    const qty = Math.max(1, parseInt(l.quantityStr, 10) || 1);
    return sum + price * qty;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const incomplete = lines.some((l) => {
      if (!l.productId || !l.variantId) return true;
      const prod = getProduct(l.productId);
      if (!prod) return true;
      if (prod.sizes.length > 0 && !l.size) return true;
      return false;
    });
    if (incomplete) {
      setError('Completa todos los campos de cada ítem (producto, variante y talla si aplica).');
      return;
    }

    const items: CreateOrderItemPayload[] = lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      size: l.size ? (l.size as ShirtSize) : undefined,
      quantity: Math.max(1, parseInt(l.quantityStr, 10) || 1),
      customName: l.customName || undefined,
    }));

    const payload = {
      items,
      shirtNumber: shirtNumber !== '' ? Number(shirtNumber) : undefined,
      notes: notes.trim() || undefined,
    };

    setSaving(true);
    try {
      let saved: Order;
      if (isEdit) {
        const { data } = await ordersService.update(order!.id, payload);
        saved = data;
      } else {
        const { data } = await ordersService.adminCreate(targetUserId, payload);
        saved = data;
      }
      onSaved(saved);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const isLoading = loadingCatalog || loadingUsers;
  const userName = isEdit
    ? (order!.user?.name ?? order!.userId)
    : users.find((u) => u.id === targetUserId)?.name ?? '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 12px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 680, padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: '#7c8db5',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2 style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>
          {isEdit ? `Editar pedido — ${userName}` : 'Nuevo pedido'}
        </h2>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={36} />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* User selector (only when creating) */}
            {!isEdit && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#7c8db5', fontSize: 13, display: 'block', marginBottom: 6 }}>
                  Usuario *
                </label>
                <select
                  className="zetas-input"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  required
                >
                  <option value="">Selecciona un usuario</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.phone})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#7c8db5', fontSize: 13, display: 'block', marginBottom: 8 }}>
                Ítems
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lines.map((line) => {
                  const prod = getProduct(line.productId);
                  return (
                    <div
                      key={line.key}
                      style={{
                        background: '#1a2035',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1fr',
                      }}
                    >
                      {/* Row 1: Producto + Variante */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <select
                          className="zetas-input"
                          value={line.productId}
                          onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                          required
                        >
                          <option value="">Producto…</option>
                          {catalog.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="zetas-input"
                          value={line.variantId}
                          onChange={(e) => updateLine(line.key, { variantId: e.target.value })}
                          disabled={!prod}
                          required
                        >
                          <option value="">Variante…</option>
                          {prod?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Row 2: Talla + Cantidad + Nombre */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 8 }}>
                        {prod && prod.sizes.length > 0 ? (
                          <select
                            className="zetas-input"
                            value={line.size}
                            onChange={(e) => updateLine(line.key, { size: e.target.value as ShirtSize | '' })}
                            required
                          >
                            <option value="">Talla…</option>
                            {prod.sizes.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div />
                        )}
                        <input
                          className="zetas-input"
                          type="number"
                          min={1}
                          max={20}
                          value={line.quantityStr}
                          onChange={(e) => updateLine(line.key, { quantityStr: e.target.value })}
                          onBlur={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateLine(line.key, { quantityStr: String(isNaN(n) || n < 1 ? 1 : Math.min(n, 20)) });
                          }}
                          placeholder="Cant."
                        />
                        {prod?.allowsCustomName ? (
                          <input
                            className="zetas-input"
                            type="text"
                            maxLength={20}
                            value={line.customName}
                            onChange={(e) => updateLine(line.key, { customName: e.target.value })}
                            placeholder="Nombre personalizado"
                          />
                        ) : (
                          <div />
                        )}
                      </div>

                      {/* Remove button */}
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'none',
                            border: 'none',
                            color: '#ff6b6b',
                            fontSize: 12,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Eliminar ítem
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addLine}
                style={{
                  marginTop: 10,
                  background: 'none',
                  border: '1px dashed #3d4f7c',
                  borderRadius: 8,
                  color: '#7c8db5',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '8px 14px',
                  width: '100%',
                }}
              >
                + Agregar ítem
              </button>
            </div>

            {/* Shirt number */}
            {requiresNumber && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#7c8db5', fontSize: 13, display: 'block', marginBottom: 6 }}>
                  Número de camiseta (0–99) *
                </label>
                <input
                  className="zetas-input"
                  type="number"
                  min={0}
                  max={99}
                  value={shirtNumber}
                  onChange={(e) => setShirtNumber(e.target.value)}
                  required
                  style={{ width: 100 }}
                />
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#7c8db5', fontSize: 13, display: 'block', marginBottom: 6 }}>
                Observaciones
              </label>
              <textarea
                className="zetas-input"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. entregar antes del torneo"
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Total */}
            {totalAmount > 0 && (
              <p style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                Total: {formatCurrency(totalAmount)}
              </p>
            )}

            {error && (
              <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || (!isEdit && !targetUserId)}
              >
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear pedido'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
