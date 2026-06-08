import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ordersService } from '../services/orders.service';
import type { CreateOrderPayload } from '../services/orders.service';
import { usersService } from '../services/users.service';
import type { CatalogProduct, CatalogVariant, Order, ShirtSize } from '../types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../types';
import { resolvePhotoUrl } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';

const money = (n: number) => `$${n.toLocaleString('es-CO')}`;

const makeKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const BRE_B_KEY = '@MLR608';
const PAYMENT_CONTACT = '316 6160159 (Milton Lenis)';
const DEPOSIT_RATE = 0.5;

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  color: '#7c8db5',
  fontSize: 13,
  marginBottom: 5,
};

export interface CartItem {
  key: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  size?: ShirtSize;
  quantity: number;
  customName?: string;
  unitPrice: number;
  lineTotal: number;
  requiresNumber: boolean;
}

function PaymentInfo({ deposit, pending }: { deposit: number; pending: number }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 8,
        background: 'rgba(110,142,251,0.1)',
        border: '1px solid rgba(110,142,251,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#c5cae9', fontSize: 13 }}>Abono ahora (50%)</span>
        <span style={{ color: '#6e8efb', fontSize: 14, fontWeight: 700 }}>{money(deposit)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#c5cae9', fontSize: 13 }}>Saldo pendiente</span>
        <span style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600 }}>{money(pending)}</span>
      </div>
      <p style={{ color: '#7c8db5', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Para confirmar tu pedido abona el 50% (<strong style={{ color: '#c5cae9' }}>{money(deposit)}</strong>)
        a la llave Bre-b <strong style={{ color: '#6e8efb' }}>{BRE_B_KEY}</strong> y envía el
        comprobante por WhatsApp al <strong style={{ color: '#c5cae9' }}>{PAYMENT_CONTACT}</strong>.
        El saldo restante se cancela en la entrega.
      </p>
    </div>
  );
}

function ProductCard({
  product,
  defaultName,
  onAdd,
}: {
  product: CatalogProduct;
  defaultName?: string;
  onAdd: (item: CartItem) => void;
}) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [size, setSize] = useState<ShirtSize | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [customName, setCustomName] = useState('');
  const [cardError, setCardError] = useState('');

  const variant: CatalogVariant | undefined = product.variants.find((v) => v.id === variantId);
  const unitPrice = variant?.price ?? product.price;

  function handleAdd() {
    setCardError('');
    if (!variant) {
      setCardError('Selecciona una variante');
      return;
    }
    if (product.sizes.length > 0 && size === '') {
      setCardError('Selecciona una talla');
      return;
    }
    onAdd({
      key: makeKey(),
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      size: product.sizes.length > 0 ? (size as ShirtSize) : undefined,
      quantity,
      customName: product.allowsCustomName ? customName.trim() || defaultName : undefined,
      unitPrice,
      lineTotal: unitPrice * quantity,
      requiresNumber: product.requiresNumber,
    });
    setQuantity(1);
    setCustomName('');
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
        {variant && (
          <img
            src={resolvePhotoUrl(variant.imageUrl)}
            alt={`${product.name} ${variant.name}`}
            style={{
              width: 160,
              height: 160,
              objectFit: 'cover',
              background: '#0f1020',
              flexShrink: 0,
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 240, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ color: '#e8eaf6', fontSize: 15, fontWeight: 700, margin: 0 }}>
              {product.name}
            </h3>
            <span style={{ color: '#6e8efb', fontWeight: 700 }}>{money(unitPrice)}</span>
          </div>
          <p style={{ color: '#7c8db5', fontSize: 13, margin: '6px 0 12px' }}>
            {product.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {product.variants.length > 1 && (
              <div style={{ flex: '1 1 120px' }}>
                <label style={LABEL_STYLE}>Modelo</label>
                <select
                  className="zetas-input"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  {product.variants.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            {product.sizes.length > 0 && (
              <div style={{ flex: '1 1 90px' }}>
                <label style={LABEL_STYLE}>Talla</label>
                <select
                  className="zetas-input"
                  value={size}
                  onChange={(e) => setSize(e.target.value as ShirtSize | '')}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">—</option>
                  {product.sizes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ flex: '0 0 80px' }}>
              <label style={LABEL_STYLE}>Cantidad</label>
              <input
                className="zetas-input"
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          </div>

          {product.allowsCustomName && (
            <div style={{ marginTop: 10 }}>
              <label style={LABEL_STYLE}>Nombre personalizado (opcional)</label>
              <input
                className="zetas-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={20}
                placeholder={defaultName ?? 'Tu nombre'}
              />
            </div>
          )}

          {cardError && (
            <p style={{ color: '#ff6b6b', fontSize: 12, margin: '8px 0 0' }}>{cardError}</p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12, fontSize: 13, padding: '8px 16px', minHeight: 36 }}
            onClick={handleAdd}
          >
            Agregar al pedido
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CamisetasPage() {
  const { user: authUser } = useAuth();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [shirtNumber, setShirtNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    Promise.all([ordersService.catalog(), usersService.me(), ordersService.myOrders()])
      .then(([catalogRes, meRes, ordersRes]) => {
        setCatalog(catalogRes.data);
        setShirtNumber(
          meRes.data.shirtNumber !== undefined && meRes.data.shirtNumber !== null
            ? String(meRes.data.shirtNumber)
            : '',
        );
        setOrders(ordersRes.data);
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, []);

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
    setSubmitting(true);
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
      await ordersService.create(payload);
      const { data } = await ordersService.myOrders();
      setOrders(data);
      setCart([]);
      setNotes('');
      setSuccess(
        `¡Pedido registrado! Para confirmarlo, abona el 50% (${money(depositForMessage)}) a la llave Bre-b ${BRE_B_KEY} y envía el comprobante al ${PAYMENT_CONTACT}. Tu talla y número quedaron guardados en tu perfil.`,
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
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
        <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Productos
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {catalog.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              defaultName={authUser?.name}
              onAdd={addToCart}
            />
          ))}
        </div>

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
                      {money(item.lineTotal)}
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
                  <span style={{ color: '#6e8efb', fontWeight: 700 }}>{money(total)}</span>
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
              disabled={submitting || cart.length === 0}
              style={{ marginTop: 16, width: '100%' }}
            >
              {submitting ? 'Registrando...' : 'Registrar pedido'}
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
                    Total: {money(order.totalAmount)}
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
