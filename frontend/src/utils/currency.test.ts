import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatSignedCurrency } from './currency';

describe('formatCurrency', () => {
  it('agrupa miles con el separador colombiano', () => {
    expect(formatCurrency(12000)).toBe('$12.000');
    expect(formatCurrency(1234567)).toBe('$1.234.567');
  });

  it('no agrega decimales', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(2000)).toBe('$2.000');
  });
});

describe('formatSignedCurrency', () => {
  it('marca los gastos con signo negativo', () => {
    expect(formatSignedCurrency(7000, 'expense')).toBe('-$7.000');
  });

  it('marca las entradas con signo positivo', () => {
    expect(formatSignedCurrency(7000, 'income')).toBe('+$7.000');
  });
});

describe('formatDate', () => {
  it('formatea día, mes corto y año', () => {
    // Mediodía UTC para que el resultado no dependa de la zona horaria.
    // El punto del mes abreviado varía según la versión de ICU.
    expect(formatDate('2026-05-05T12:00:00.000Z')).toMatch(/^5 de may\.? de 2026$/);
  });

  it('acepta objetos Date', () => {
    expect(formatDate(new Date('2026-01-15T12:00:00.000Z'))).toMatch(/2026$/);
  });
});
