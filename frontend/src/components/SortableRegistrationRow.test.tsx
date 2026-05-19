import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortableRegistrationRow } from './SortableRegistrationRow';
import type { GameRegistration } from '../types';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => null,
    },
  },
}));

vi.mock('./Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
}));

function makeReg(overrides: Partial<GameRegistration> = {}): GameRegistration {
  return {
    id: 'r1',
    gameId: 'g1',
    userId: 'u1',
    position: 1,
    isWaitingList: false,
    attended: false,
    paid: false,
    fromWaitList: false,
    isGuest: false,
    pendingConfirmation: false,
    confirmationDeclined: false,
    registeredAt: '2026-01-01',
    registeredById: 'u2',
    user: { id: 'u1', name: 'Carlos', username: 'carlos', phone: '123' },
    registeredBy: { id: 'u2', name: 'Admin', username: 'admin' },
    ...overrides,
  };
}

describe('SortableRegistrationRow', () => {
  const baseProps = {
    reg: makeReg(),
    index: 0,
    isAdmin: true,
    isSelf: false,
    allowSelfRemove: false,
    draggable: false,
    onNameClick: vi.fn(),
    onToggleAttended: vi.fn(),
    onTogglePaid: vi.fn(),
    onRemove: vi.fn(),
  };

  it('muestra el nombre del jugador', () => {
    render(<SortableRegistrationRow {...baseProps} />);
    expect(screen.getAllByText('Carlos').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra botones de admin cuando NO es readonly', () => {
    render(<SortableRegistrationRow {...baseProps} readonly={false} />);
    expect(screen.getByTitle('Asistió')).toBeInTheDocument();
    expect(screen.getByTitle('Pagó')).toBeInTheDocument();
    expect(screen.getByTitle('Eliminar')).toBeInTheDocument();
  });

  it('oculta botones de admin cuando es readonly', () => {
    render(<SortableRegistrationRow {...baseProps} readonly={true} />);
    expect(screen.queryByTitle('Asistió')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pagó')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Eliminar')).not.toBeInTheDocument();
  });

  it('oculta botones de admin para miembros no-admin', () => {
    render(<SortableRegistrationRow {...baseProps} isAdmin={false} />);
    expect(screen.queryByTitle('Asistió')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pagó')).not.toBeInTheDocument();
  });

  it('no muestra el drag handle cuando draggable=false', () => {
    render(<SortableRegistrationRow {...baseProps} draggable={false} />);
    expect(screen.queryByText('⠿')).not.toBeInTheDocument();
  });

  it('muestra el drag handle cuando draggable=true', () => {
    render(<SortableRegistrationRow {...baseProps} draggable={true} />);
    expect(screen.getByText('⠿')).toBeInTheDocument();
  });

  it('muestra "Tú" cuando isSelf=true', () => {
    render(<SortableRegistrationRow {...baseProps} isSelf={true} />);
    expect(screen.getByText('Tú')).toBeInTheDocument();
  });

  it('muestra botón "Salirme" para miembro que es isSelf con allowSelfRemove', () => {
    render(
      <SortableRegistrationRow
        {...baseProps}
        isAdmin={false}
        isSelf={true}
        allowSelfRemove={true}
      />,
    );
    expect(screen.getByText('Salirme')).toBeInTheDocument();
  });

  it('muestra botón Promover para jugadores en lista de espera', () => {
    const waitReg = makeReg({ isWaitingList: true });
    render(<SortableRegistrationRow {...baseProps} reg={waitReg} />);
    expect(screen.getByTitle('Promover a lista principal')).toBeInTheDocument();
    expect(screen.queryByTitle('Mover a lista de espera')).not.toBeInTheDocument();
  });

  it('oculta botón Promover cuando la lista principal está llena', () => {
    const waitReg = makeReg({ isWaitingList: true });
    render(<SortableRegistrationRow {...baseProps} reg={waitReg} mainListFull={true} />);
    expect(screen.queryByTitle('Promover a lista principal')).not.toBeInTheDocument();
  });

  it('muestra botón Demote para jugadores en lista principal', () => {
    render(<SortableRegistrationRow {...baseProps} />);
    expect(screen.getByTitle('Mover a lista de espera')).toBeInTheDocument();
    expect(screen.queryByTitle('Promover a lista principal')).not.toBeInTheDocument();
  });

  it('oculta botones Promover/Demote cuando es readonly', () => {
    render(<SortableRegistrationRow {...baseProps} readonly={true} />);
    expect(screen.queryByTitle('Mover a lista de espera')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Promover a lista principal')).not.toBeInTheDocument();
  });
});
