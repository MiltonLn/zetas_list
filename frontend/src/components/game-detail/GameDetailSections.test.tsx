import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompletionReport, GameSummary, RegistrationActions } from './GameDetailSections';

describe('GameDetailSections', () => {
  it('renderiza el resumen calculado y el reporte', () => {
    render(
      <>
        <GameSummary mainCount={12} maxMainSpots={18} attended={10} paid={9} collected={18000} />
        <CompletionReport report={'Resumen\n**Pagaron:** 9'} loading={false} />
      </>,
    );

    expect(screen.getByText('12/18')).toBeInTheDocument();
    expect(screen.getByText('$18.000')).toBeInTheDocument();
    expect(screen.getByText('Resumen')).toBeInTheDocument();
    expect(screen.getByText(/Pagaron:/)).toBeInTheDocument();
  });

  it('conserva las acciones de registro', () => {
    const onRegister = vi.fn();
    const onRegisterOther = vi.fn();
    render(
      <RegistrationActions
        hasPendingConfirmation={false}
        isAlreadyRegistered={false}
        spotsLeft={2}
        registrationError=""
        registering={false}
        onConfirm={vi.fn()}
        onRemoveSelf={vi.fn()}
        onRegister={onRegister}
        onRegisterOther={onRegisterOther}
      />,
    );

    fireEvent.click(screen.getByText('🏐 ¡Anotame!'));
    fireEvent.click(screen.getByText('+ Anotar a alguien más'));
    expect(onRegister).toHaveBeenCalledOnce();
    expect(onRegisterOther).toHaveBeenCalledOnce();
  });
});
