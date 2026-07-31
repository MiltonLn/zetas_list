import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { AdminUsersList } from './AdminUsersList';

const user: User = {
  id: 'user-1',
  username: 'ana',
  name: 'Ana Pérez',
  alias: 'Ana',
  phone: '573001234567',
  role: 'ayudante',
  position: 'libero',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AdminUsersList', () => {
  it('renderiza datos y delega las acciones de fila', () => {
    const onProfile = vi.fn();
    const onEdit = vi.fn();
    const onManage = vi.fn();
    render(
      <AdminUsersList
        users={[user]}
        loading={false}
        onProfile={onProfile}
        onEdit={onEdit}
        onManage={onManage}
      />,
    );

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Ayudante')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ana Pérez'));
    fireEvent.click(screen.getByTitle('Editar perfil'));
    fireEvent.click(screen.getByTitle('Estado de cuenta'));
    expect(onProfile).toHaveBeenCalledWith(user);
    expect(onEdit).toHaveBeenCalledWith(user);
    expect(onManage).toHaveBeenCalledWith(user);
  });

  it('muestra el estado vacío', () => {
    render(
      <AdminUsersList
        users={[]}
        loading={false}
        onProfile={vi.fn()}
        onEdit={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    expect(screen.getByText('No se encontraron usuarios')).toBeInTheDocument();
  });
});
