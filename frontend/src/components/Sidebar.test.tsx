import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import type { AuthUser, Role } from '../types';

const mockAuth = vi.hoisted(() => ({
  value: {} as { user: AuthUser | null; isAdmin: boolean; logout: () => void },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth.value,
}));

function setUser(role: Role, overrides: Partial<AuthUser> = {}) {
  mockAuth.value = {
    user: { id: 'u1', username: 'jz', name: 'Juan Zapata', role, phone: '1', ...overrides },
    isAdmin: role === 'admin',
    logout: vi.fn(),
  };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar open onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => setUser('member'));

  it('muestra el alias en lugar del nombre real', () => {
    setUser('member', { alias: 'Juancho' });
    renderSidebar();
    expect(screen.getByText('Juancho')).toBeInTheDocument();
    expect(screen.queryByText('Juan Zapata')).not.toBeInTheDocument();
  });

  it('cae al nombre real si no hay alias', () => {
    renderSidebar();
    expect(screen.getByText('Juan Zapata')).toBeInTheDocument();
  });

  it('no muestra la sección de administración a un member', () => {
    renderSidebar();
    expect(screen.getByText('Partidos')).toBeInTheDocument();
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('muestra todas las entradas de gestión a un admin', () => {
    setUser('admin');
    renderSidebar();
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Partido')).toBeInTheDocument();
    expect(screen.getByText('Gestionar Finanzas')).toBeInTheDocument();
    expect(screen.getByText('Parser (Legacy)')).toBeInTheDocument();
  });

  it('al ayudante solo le muestra las entradas de su rol', () => {
    setUser('ayudante');
    renderSidebar();
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByText('Parser (Legacy)')).toBeInTheDocument();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
    expect(screen.queryByText('Nuevo Partido')).not.toBeInTheDocument();
    expect(screen.queryByText('Gestionar Finanzas')).not.toBeInTheDocument();
  });
});
