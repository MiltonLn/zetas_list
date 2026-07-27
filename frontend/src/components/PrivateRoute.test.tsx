import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { ADMIN_ONLY, GAME_MANAGERS } from '../utils/roles';
import type { AuthUser, Role } from '../types';

const mockAuth = vi.hoisted(() => ({ value: {} as { user: AuthUser | null; loading: boolean } }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth.value,
}));

function makeUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 'u1', username: 'u', name: 'U', role, phone: '1', ...overrides };
}

function renderAt(path: string, allowedRoles?: readonly Role[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>inicio</div>} />
        <Route path="/login" element={<div>login</div>} />
        <Route path="/change-password" element={<div>cambiar clave</div>} />
        <Route
          path="/protegido"
          element={
            <PrivateRoute allowedRoles={allowedRoles}>
              <div>contenido</div>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    mockAuth.value = { user: null, loading: false };
  });

  it('redirige a login si no hay sesión', () => {
    renderAt('/protegido');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('deja pasar a cualquier usuario autenticado cuando no se piden roles', () => {
    mockAuth.value = { user: makeUser('member'), loading: false };
    renderAt('/protegido');
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('fuerza el cambio de contraseña antes de cualquier otra ruta', () => {
    mockAuth.value = { user: makeUser('admin', { mustChangePassword: true }), loading: false };
    renderAt('/protegido');
    expect(screen.getByText('cambiar clave')).toBeInTheDocument();
  });

  it('bloquea a un member en rutas de admin', () => {
    mockAuth.value = { user: makeUser('member'), loading: false };
    renderAt('/protegido', ADMIN_ONLY);
    expect(screen.getByText('inicio')).toBeInTheDocument();
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });

  it('bloquea a un ayudante en rutas de admin', () => {
    mockAuth.value = { user: makeUser('ayudante'), loading: false };
    renderAt('/protegido', ADMIN_ONLY);
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });

  it('deja pasar al ayudante en rutas de gestión de partido', () => {
    mockAuth.value = { user: makeUser('ayudante'), loading: false };
    renderAt('/protegido', GAME_MANAGERS);
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('deja pasar al admin en rutas de gestión de partido', () => {
    mockAuth.value = { user: makeUser('admin'), loading: false };
    renderAt('/protegido', GAME_MANAGERS);
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});
