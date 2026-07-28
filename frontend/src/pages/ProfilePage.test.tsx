import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from './ProfilePage';
import {
  useMeQuery,
  useUpdateUserMutation,
  useUploadUserPhotoMutation,
} from '../hooks/useUsersQuery';
import type { User } from '../types';
import { queryWrapper } from '../test/query-wrapper';
import { MemoryRouter } from 'react-router-dom';
import { prepareImageForCrop } from '../utils/image';

const setUser = vi.fn();
const updateProfile = vi.fn();
const uploadPhoto = vi.fn();
const profile: User = {
  id: 'user-1',
  username: 'ana',
  name: 'Ana',
  alias: 'Ani',
  phone: '3000000000',
  role: 'admin',
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

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: profile, isAdmin: true, setUser }),
}));
vi.mock('../hooks/useUsersQuery');
vi.mock('../utils/image', () => ({ prepareImageForCrop: vi.fn() }));
vi.mock('../components/ImageCropModal', () => ({
  ImageCropModal: ({ onCrop }: { onCrop: (blob: Blob) => void }) => (
    <button onClick={() => void onCrop(new Blob(['foto'], { type: 'image/jpeg' }))}>
      Confirmar foto
    </button>
  ),
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMeQuery).mockReturnValue({
      data: profile,
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useUpdateUserMutation).mockReturnValue({
      mutateAsync: updateProfile,
      isPending: false,
    } as never);
    vi.mocked(useUploadUserPhotoMutation).mockReturnValue({
      mutateAsync: uploadPhoto,
      isPending: false,
    } as never);
  });

  it('sincroniza el usuario autenticado después de editar el perfil', async () => {
    const updated = { ...profile, alias: 'Anita' };
    updateProfile.mockResolvedValue(updated);
    const user = userEvent.setup();
    const QueryWrapper = queryWrapper();
    render(<ProfilePage />, {
      wrapper: ({ children }) => (
        <QueryWrapper>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryWrapper>
      ),
    });

    const alias = screen.getByPlaceholderText('Ana');
    await user.clear(alias);
    await user.type(alias, 'Anita');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(setUser).toHaveBeenCalledWith(updated);
  });

  it('sincroniza el usuario autenticado después de subir la foto', async () => {
    vi.mocked(prepareImageForCrop).mockResolvedValue('data:image/jpeg;base64,foto');
    const updated = { ...profile, photoUrl: '/foto.jpg' };
    uploadPhoto.mockResolvedValue(updated);
    const user = userEvent.setup();
    const QueryWrapper = queryWrapper();
    const { container } = render(<ProfilePage />, {
      wrapper: ({ children }) => (
        <QueryWrapper>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryWrapper>
      ),
    });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await user.upload(input!, new File(['foto'], 'foto.jpg', { type: 'image/jpeg' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar foto' }));

    expect(setUser).toHaveBeenCalledWith(updated);
  });
});
