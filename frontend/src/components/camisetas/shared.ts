import type { ShirtSize } from '../../types';

export const makeKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const BRE_B_KEY = '@MLR608';
export const PAYMENT_CONTACT = '316 6160159 (Milton Lenis)';
export const DEPOSIT_RATE = 0.5;

export const LABEL_STYLE: React.CSSProperties = {
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
