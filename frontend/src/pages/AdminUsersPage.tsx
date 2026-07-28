import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminUsersList } from '../components/admin-users/AdminUsersList';
import {
  CreateUserModal,
  EditUserModal,
  ManageUserModal,
} from '../components/admin-users/AdminUserModals';
import { PageHeader } from '../components/PageHeader';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { useUsersQuery } from '../hooks/useUsersQuery';
import { getApiError } from '../services/api';
import type { User } from '../types';
import { showToast } from '../utils/toast';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [managedUser, setManagedUser] = useState<User | null>(null);
  const usersQuery = useUsersQuery(submittedSearch);

  useEffect(() => {
    if (usersQuery.error) showToast(getApiError(usersQuery.error), 'error');
  }, [usersQuery.error]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(search || undefined);
  };

  return (
    <>
      <PageHeader
        title="Gestión de Usuarios"
        backTo="/"
        action={
          <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px', minHeight: 38 }}>
            + Crear usuario
          </button>
        }
      />

      <div className="page-wrapper" style={{ maxWidth: 800 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="zetas-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, usuario o teléfono..."
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px' }}>
            Buscar
          </button>
          {search && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch('');
                setSubmittedSearch(undefined);
              }}
              style={{ padding: '10px 14px' }}
            >
              ✕
            </button>
          )}
        </form>

        <AdminUsersList
          users={usersQuery.data ?? []}
          loading={usersQuery.isPending}
          onProfile={setProfileUser}
          onEdit={setEditUser}
          onManage={setManagedUser}
        />
      </div>

      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      <ManageUserModal user={managedUser} onClose={() => setManagedUser(null)} />
      {profileUser && <PlayerProfileModal user={profileUser} onClose={() => setProfileUser(null)} />}
    </>
  );
}
