import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { CreateOrderPayload } from '../services/orders.service';
import type { CatalogProduct } from '../types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { PaymentInfo } from '../components/camisetas/PaymentInfo';
import { ProductTile } from '../components/camisetas/ProductTile';
import { ProductConfigModal } from '../components/camisetas/ProductConfigModal';
import { formatCurrency } from '../utils/currency';
import {
  BRE_B_KEY,
  PAYMENT_CONTACT,
  DEPOSIT_RATE,
  LABEL_STYLE,
  type CartItem,
} from '../components/camisetas/shared';
import {
  useCreateOrderMutation,
  useMyOrdersQuery,
  useOrdersCatalogQuery,
} from '../hooks/useOrdersQuery';
import { useMeQuery } from '../hooks/useUsersQuery';

export default function CamisetasPage() {
  const { user: authUser } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const catalogQuery = useOrdersCatalogQuery();
  const meQuery = useMeQuery();
  const ordersQuery = useMyOrdersQuery();
  const createOrder = useCreateOrderMutation();
  const catalog = catalogQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  const [shirtNumber, setShirtNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [configProduct, setConfigProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    const savedNumber = meQuery.data?.shirtNumber;
    if (savedNumber !== undefined && savedNumber !== null) {
      setShirtNumber((current) => current || String(savedNumber));
    }
  }, [meQuery.data]);

  useEffect(() => {
    const queryError = catalogQuery.error ?? meQuery.error ?? ordersQuery.error;
    if (queryError) setError(getApiError(queryError));
  }, [catalogQuery.error, meQuery.error, ordersQuery.error]);

  const total = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const deposit = Math.round(total * DEPOSIT_RATE);
  const pending = total - deposit;
  const cartRequiresNumber = cart.some((item) => item.requiresNumber);

  function addToCart(item: CartItem) {
    setCart((prev) => [...prev, item]);
    setSuccess('');
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (cart.length === 0) {
      setError('Agrega al menos un artículo a tu pedido');
      return;
    }

    if (cartRequiresNumber && shirtNumber.trim() === '') {
      setError('Debes indicar tu número de camiseta');
      return;
    }

    const parsedNumber = shirtNumber.trim() === '' ? undefined : parseInt(shirtNumber, 10);
    if (parsedNumber !== undefined && (parsedNumber < 0 || parsedNumber > 99)) {
      setError('El número de camiseta debe estar entre 0 y 99');
      return;
    }

    const depositForMessage = deposit;
    try {
      const payload: CreateOrderPayload = {
        shirtNumber: parsedNumber,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          size: item.size,
          quantity: item.quantity,
          customName: item.customName?.trim() || undefined,
        })),
      };
      await createOrder.mutateAsync(payload);
      setCart([]);
      setNotes('');
      setSuccess(
        `¡Pedido registrado! Para confirmarlo, abona el 50% (${formatCurrency(depositForMessage)}) a la llave Bre-b ${BRE_B_KEY} y envía el comprobante al ${PAYMENT_CONTACT}. Tu talla y número quedaron guardados en tu perfil.`,
      );
    } catch (err) {
      setError(getApiError(err));
    }
  }

  if (catalogQuery.isPending || meQuery.isPending || ordersQuery.isPending) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Pedido de Camisetas" backTo="/" />

      <div className="page-wrapper" style={{ maxWidth: 760 }}>
        <p style={{ color: '#7c8db5', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
          Arma tu pedido de uniforme. Puedes agregar varias camisetas y pantalonetas en sus
          distintas variantes. Tu talla y número se guardan en tu perfil al registrar el pedido.
        </p>

        {/* Mis datos */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
            Mis datos
          </h2>
          <div style={{ maxWidth: 220 }}>
            <label style={LABEL_STYLE}>Número de camiseta (0-99)</label>
            <input
              className="zetas-input"
              type="number"
              min={0}
              max={99}
              value={shirtNumber}
              onChange={(e) => setShirtNumber(e.target.value)}
              placeholder="Ej. 7"
            />
          </div>
          <p style={{ color: '#7c8db5', fontSize: 11, margin: '8px 0 0' }}>
            El número debe ser único dentro de tu categoría (un hombre y una mujer pueden compartir
            el mismo número).
          </p>
        </div>

        {/* Guía de tallas */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <button
            type="button"
            className="btn"
            style={{ background: 'transparent', color: '#6e8efb', padding: 0, minHeight: 0 }}
            onClick={() => setShowGuide((v) => !v)}
          >
            {showGuide ? '▾' : '▸'} Guía de tallas
          </button>
          {showGuide && (
            <div style={{ marginTop: 16 }}>
              <img
                src="/camisetas/guia-tallas.png"
                alt="Guía de tallas"
                style={{ width: '100%', borderRadius: 8, display: 'block' }}
              />
            </div>
          )}
        </div>

        {/* Catálogo */}
        <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Productos
        </h2>
        <p style={{ color: '#7c8db5', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Toca un producto para elegir talla y agregarlo a tu pedido.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {catalog.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              onClick={() => setConfigProduct(product)}
            />
          ))}
        </div>

        {configProduct && (
          <ProductConfigModal
            product={configProduct}
            defaultName={authUser?.name}
            onAdd={addToCart}
            onClose={() => setConfigProduct(null)}
          />
        )}

        {/* Carrito */}
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
              Tu pedido
            </h2>

            {cart.length === 0 ? (
              <p style={{ color: '#7c8db5', fontSize: 14, margin: 0 }}>
                Aún no has agregado artículos.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cart.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'var(--color-surface-2, #1a1c2e)',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600 }}>
                        {item.productName} · {item.variantName}
                      </div>
                      <div style={{ color: '#7c8db5', fontSize: 12 }}>
                        {item.size ? `Talla ${item.size} · ` : ''}
                        {`x${item.quantity}`}
                        {item.customName ? ` · "${item.customName}"` : ''}
                        {item.requiresNumber && shirtNumber ? ` · #${shirtNumber}` : ''}
                      </div>
                    </div>
                    <div style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600 }}>
                      {formatCurrency(item.lineTotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.key)}
                      aria-label="Quitar"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ff6b6b',
                        cursor: 'pointer',
                        fontSize: 18,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(124,141,181,0.2)',
                    paddingTop: 12,
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: '#e8eaf6', fontWeight: 700 }}>Total</span>
                  <span style={{ color: '#6e8efb', fontWeight: 700 }}>{formatCurrency(total)}</span>
                </div>

                <PaymentInfo deposit={deposit} pending={pending} />
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>Notas (opcional)</label>
              <textarea
                className="zetas-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguna indicación especial para tu pedido..."
                maxLength={500}
                rows={2}
                style={{ resize: 'vertical', minHeight: 48 }}
              />
            </div>

            {error && <p style={{ color: '#ff6b6b', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
            {success && <p style={{ color: '#2da44e', fontSize: 13, margin: '12px 0 0' }}>{success}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={createOrder.isPending || cart.length === 0}
              style={{ marginTop: 16, width: '100%' }}
            >
              {createOrder.isPending ? 'Registrando...' : 'Registrar pedido'}
            </button>
          </div>
        </form>

        {/* Mis pedidos */}
        {orders.length > 0 && (
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
              Mis pedidos
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {orders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--color-surface-2, #1a1c2e)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: '#7c8db5', fontSize: 12 }}>
                      {new Date(order.createdAt).toLocaleDateString('es-CO')}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: ORDER_STATUS_COLORS[order.status],
                        background: `${ORDER_STATUS_COLORS[order.status]}22`,
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  {order.items.map((item) => (
                    <div key={item.id} style={{ color: '#c5cae9', fontSize: 13 }}>
                      {item.productName} · {item.variantName}
                      {item.size ? ` · ${item.size}` : ''} · x{item.quantity}
                      {item.customNumber !== null && item.customNumber !== undefined
                        ? ` · #${item.customNumber}`
                        : ''}
                    </div>
                  ))}
                  <div style={{ color: '#e8eaf6', fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    Total: {formatCurrency(order.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
