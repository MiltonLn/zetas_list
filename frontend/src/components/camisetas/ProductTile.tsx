import type { CatalogProduct } from '../../types';
import { formatCurrency } from '../../utils/currency';

export function ProductTile({
  product,
  onClick,
}: {
  product: CatalogProduct;
  onClick: () => void;
}) {
  const variant = product.variants[0];
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      aria-label={product.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
    >
      <div
        style={{
          height: 130,
          background: '#0f1020',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {variant && (
          <img
            src={variant.imageUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ color: '#e8eaf6', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ color: '#6e8efb', fontSize: 14, fontWeight: 700 }}>
            {formatCurrency(product.price)}
          </span>
          <span style={{ color: '#7c8db5', fontSize: 18, lineHeight: 1 }}>+</span>
        </div>
      </div>
    </div>
  );
}
