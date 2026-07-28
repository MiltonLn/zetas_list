import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManageUserModal } from './AdminUserModals';
import { usersService } from '../../services/users.service';
import { queryWrapper } from '../../test/query-wrapper';
import type { User } from '../../types';

const member: User = {
  id: 'member-1',
  username: 'member',
  name: 'Miembro',
  alias: null,
  phone: '3000000000',
  role: 'member',
  position: null,
  gender: null,
  heightCm: null,
  birthDate: null,
  photoUrl: null,
  bio: null,
  shirtSize: null,
  shirtNumber: null,
  status: 'active',
  banReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ManageUserModal', () => {
  it('bloquea acciones de rol mientras hay una solicitud pendiente', async () => {
    let resolve!: (value: { data: User }) => void;
    vi.spyOn(usersService, 'updateRole').mockReturnValue(
      new Promise((done) => { resolve = done; }) as ReturnType<typeof usersService.updateRole>,
    );
    const user = userEvent.setup();

    render(<ManageUserModal user={member} onClose={vi.fn()} />, {
      wrapper: queryWrapper(),
    });

    const adminButton = screen.getByRole('button', { name: /Hacer administrador/ });
    await user.dblClick(adminButton);

    expect(usersService.updateRole).toHaveBeenCalledTimes(1);
    expect(adminButton).toBeDisabled();
    resolve({ data: { ...member, role: 'admin' } });
  });
});
