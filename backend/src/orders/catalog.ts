import { ShirtSize } from '@prisma/client';

export interface CatalogVariant {
  id: string;
  name: string;
  imageUrl: string;
  /** Optional price override; falls back to the product price when undefined. */
  price?: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  /** Base price in COP. */
  price: number;
  /** Whether a jersey number must be provided for this product. */
  requiresNumber: boolean;
  /** Whether a custom printed name can be requested for this product. */
  allowsCustomName: boolean;
  /** Available sizes; empty array means the product has no size selection. */
  sizes: ShirtSize[];
  variants: CatalogVariant[];
}

const ALL_SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/**
 * Fixed shirt catalog. Image paths point to static assets served by the
 * frontend (`frontend/public/camisetas/...`). Prices are authoritative here so
 * the order total is always computed server-side.
 */
export const CATALOG: CatalogProduct[] = [
  {
    id: 'camiseta',
    name: 'Camiseta',
    description: 'Camiseta oficial del equipo con tu número y nombre.',
    price: 55000,
    requiresNumber: true,
    allowsCustomName: true,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'local',
        name: 'Local',
        imageUrl: '/camisetas/camiseta-local.svg',
      },
      {
        id: 'visitante',
        name: 'Visitante',
        imageUrl: '/camisetas/camiseta-visitante.svg',
      },
    ],
  },
  {
    id: 'pantaloneta',
    name: 'Pantaloneta',
    description: 'Pantaloneta deportiva a juego con el uniforme.',
    price: 40000,
    requiresNumber: false,
    allowsCustomName: false,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'estandar',
        name: 'Estándar',
        imageUrl: '/camisetas/pantaloneta.svg',
      },
    ],
  },
];

export function getProduct(productId: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === productId);
}

export function getVariant(
  product: CatalogProduct,
  variantId: string,
): CatalogVariant | undefined {
  return product.variants.find((v) => v.id === variantId);
}

/** Unit price for a product/variant pair (variant override wins). */
export function getUnitPrice(
  product: CatalogProduct,
  variant: CatalogVariant,
): number {
  return variant.price ?? product.price;
}
