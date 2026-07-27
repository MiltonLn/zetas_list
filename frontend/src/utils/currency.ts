/** Colombian pesos, no decimals: 12000 → "$12.000". */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('es-CO')}`;
}

/** Signed variant for ledgers: expenses render as "-$12.000". */
export function formatSignedCurrency(amount: number, type: 'income' | 'expense'): string {
  return `${type === 'expense' ? '-' : '+'}${formatCurrency(amount)}`;
}

/** Short date for tables and lists: "5 may 2026". */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
