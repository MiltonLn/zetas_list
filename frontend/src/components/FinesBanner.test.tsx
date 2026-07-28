import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinesBanner } from './FinesBanner';
import { useMyFinesQuery } from '../hooks/useFinancesQuery';

vi.mock('../hooks/useFinancesQuery');

describe('FinesBanner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra el total pendiente formateado', () => {
    vi.mocked(useMyFinesQuery).mockReturnValue({
      data: { fines: [], total: 15000 },
      isPending: false,
    } as never);

    render(<FinesBanner />);

    expect(screen.getByText('$15.000')).toBeInTheDocument();
  });

  it('no muestra un banner sin deuda', () => {
    vi.mocked(useMyFinesQuery).mockReturnValue({
      data: { fines: [], total: 0 },
      isPending: false,
    } as never);

    const { container } = render(<FinesBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
