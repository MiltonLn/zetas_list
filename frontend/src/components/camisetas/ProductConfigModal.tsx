import { useState } from 'react';
import type { CatalogProduct, CatalogVariant, ShirtSize } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { makeKey, LABEL_STYLE, type CartItem } from './shared';

export function ProductConfigModal({
  product,
  defaultName,
  onAdd,
  onClose,
}: {
  product: CatalogProduct;
  defaultName?: string;
  onAdd: (item: CartItem) => void;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [size, setSize] = useState<ShirtSize | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [customName, setCustomName] = useState('');
  const [cardError, setCardError] = useState('');
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

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
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 900, padding: 16,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: 0, overflow: 'hidden', width: '100%', maxWidth: 440,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {variant && (
          <div
            onClick={() => setFullPhoto(variant.imageUrl)}
            style={{
              height: 200,
              background: '#0f1020',
              cursor: 'zoom-in',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={variant.imageUrl}
              alt={`${product.name} ${variant.name}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          </div>
        )}

        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <h3 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, margin: 0 }}>
              {product.name}
            </h3>
            <span style={{ color: '#6e8efb', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(unitPrice)}</span>
          </div>
          <p style={{ color: '#7c8db5', fontSize: 13, margin: '6px 0 14px' }}>
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

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, fontSize: 13, padding: '8px 16px', minHeight: 36 }}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 2, fontSize: 13, padding: '8px 16px', minHeight: 36 }}
              onClick={handleAdd}
            >
              Agregar al pedido
            </button>
          </div>
        </div>
      </div>

      {fullPhoto && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setFullPhoto(null);
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <img
            src={fullPhoto}
            alt={product.name}
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12, objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
}
