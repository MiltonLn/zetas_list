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
    name: 'Camiseta Azul/Blanca Normal',
    description: 'Camiseta oficial del equipo con tu número y nombre.',
    price: 45000,
    requiresNumber: true,
    allowsCustomName: true,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'local',
        name: 'Local',
        imageUrl: '/camisetas/camiseta-normal.png',
      }
    ],
  },
  {
    id: 'camiseta-2',
    name: 'Camiseta Azul/Blanca Manga Sisa',
    description: 'Camiseta oficial del equipo con tu número y nombre con manga sisa.',
    price: 40000,
    requiresNumber: true,
    allowsCustomName: true,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'local',
        name: 'Local',
        imageUrl: '/camisetas/camiseta-sisa-azul.png',
      }
    ],
  },
  {
    id: 'pantaloneta',
    name: 'Pantaloneta Azul/Blanca',
    description: 'Pantaloneta deportiva a juego con el uniforme.',
    price: 45000,
    requiresNumber: true,
    allowsCustomName: false,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'estandar',
        name: 'Estándar',
        imageUrl: '/camisetas/pantaloneta-normal.png',
      },
    ],
  },
  {
    id: 'camiseta-3',
    name: 'Camiseta Rosa/Blanca Normal',
    description: 'Camiseta oficial del equipo con tu número y nombre.',
    price: 45000,
    requiresNumber: true,
    allowsCustomName: true,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'local',
        name: 'Local',
        imageUrl: '/camisetas/camiseta-normal-rosa.png',
      }
    ],
  },
  {
    id: 'camiseta-4',
    name: 'Camiseta Rosa/Blanca Manga Sisa',
    description: 'Camiseta oficial del equipo con tu número y nombre con manga sisa.',
    price: 40000,
    requiresNumber: true,
    allowsCustomName: true,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'local',
        name: 'Local',
        imageUrl: '/camisetas/camiseta-sisa-rosa.png',
      }
    ],
  },
  {
    id: 'pantaloneta-2',
    name: 'Pantaloneta Rosa/Blanca',
    description: 'Pantaloneta deportiva a juego con el uniforme rosa.',
    price: 45000,
    requiresNumber: true,
    allowsCustomName: false,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'estandar',
        name: 'Estándar',
        imageUrl: '/camisetas/pantaloneta-rosa.png',
      },
    ],
  },
  {
    id: 'short-rosa',
    name: 'Short Atletico Rosa/Blanco',
    description: 'Short deportivo a juego con el uniforme rosa.',
    price: 40000,
    requiresNumber: true,
    allowsCustomName: false,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'estandar',
        name: 'Estándar',
        imageUrl: '/camisetas/short-rosa.png',
      },
    ],
  },
  {
    id: 'short-azul',
    name: 'Short Atletico Azul/Blanco',
    description: 'Short deportivo a juego con el uniforme azul.',
    price: 40000,
    requiresNumber: true,
    allowsCustomName: false,
    sizes: ALL_SIZES,
    variants: [
      {
        id: 'estandar',
        name: 'Estándar',
        imageUrl: '/camisetas/short-azul.png',
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
