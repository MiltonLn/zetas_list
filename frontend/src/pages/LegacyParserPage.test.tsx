import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import LegacyParserPage from './LegacyParserPage';

describe('LegacyParserPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mantiene la navegación local entre inicio y nueva lista', () => {
    render(<LegacyParserPage />);

    expect(screen.getByText('Parser (Legacy)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Nueva Lista'));
    expect(screen.getByText('Nueva Lista')).toBeInTheDocument();
    fireEvent.click(screen.getByText('← Volver a listas'));
    expect(screen.getByText('Parser (Legacy)')).toBeInTheDocument();
  });

  it('lee las listas existentes desde localStorage', () => {
    localStorage.setItem('zetas-legacy-lists', JSON.stringify([{
      id: 'game-1',
      title: 'Partido legado',
      rawMessage: '',
      createdAt: '2026-07-01T00:00:00.000Z',
      mainList: [],
      waitList: [],
    }]));

    render(<LegacyParserPage />);
    expect(screen.getByText('Partido legado')).toBeInTheDocument();
  });
});
