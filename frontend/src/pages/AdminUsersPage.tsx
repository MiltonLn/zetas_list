import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { usersService } from '../services/users.service';
import type { CreateUserPayload } from '../services/users.service';
import type { User, UserStatus, Role, Position, Gender } from '../types';
import { POSITION_LABELS, GENDER_LABELS, USER_STATUS_LABELS, USER_STATUS_COLORS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Avatar } from '../components/Avatar';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { Modal } from '../components/Modal';
import { getApiError } from '../services/api';


export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [position, setPosition] = useState<Position | ''>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [banReason, setBanReason] = useState('');
  const [statusAction, setStatusAction] = useState<UserStatus | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load(q?: string) {
    setLoading(true);
    setError('');
    try {
      const { data } = await usersService.list(q);
      setUsers(data);
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(search || undefined);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const payload: CreateUserPayload = {
        username,
        name,
        phone,
        role,
        position: position || undefined,
        gender: (gender as Gender) || undefined,
      };
      const { data } = await usersService.create(payload);
      setUsers((prev) => [data, ...prev]);
      setShowCreate(false);
      setUsername('');
      setName('');
      setPhone('');
      setRole('member');
      setPosition('');
      setGender('');
    } catch (err) {
      setCreateError(getApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange() {
    if (!selectedUser || !statusAction) return;
    if (statusAction === 'banned' && !banReason.trim()) return;
    setStatusSaving(true);
    try {
      const { data } = await usersService.updateStatus(
        selectedUser.id,
        statusAction,
        statusAction === 'banned' ? banReason : undefined,
      );
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
      setSelectedUser(null);
      setStatusAction(null);
      setBanReason('');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Gestión de Usuarios"
        backTo="/"
        action={
          <button
            onClick={() => {
              setUsername('');
              setName('');
              setPhone('');
              setRole('member');
              setPosition('');
              setGender('');
              setCreateError('');
              setShowCreate(true);
            }}
            className="btn btn-primary"
            style={{ fontSize: 13, padding: '8px 14px', minHeight: 38 }}
          >
            + Crear usuario
          </button>
        }
      />

      <div className="page-wrapper" style={{ maxWidth: 800 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="zetas-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              onClick={() => { setSearch(''); load(); }}
              style={{ padding: '10px 14px' }}
            >
              ✕
            </button>
          )}
        </form>

        {error && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  background: '#161829',
                  border: '1px solid #2a2f5a',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  onClick={() => setProfileUser(user)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
                >
                  <Avatar name={user.name} photoUrl={user.photoUrl} size={40} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#e8eaf6', fontWeight: 600, fontSize: 14 }}>{user.name}</span>
                      <span style={{ color: '#7c8db5', fontSize: 12 }}>@{user.username}</span>
                    {user.role === 'admin' && (
                      <span style={{ background: '#3b5bdb22', color: '#6e8efb', fontSize: 11, padding: '1px 7px', borderRadius: 6, fontWeight: 600 }}>
                        Admin
                      </span>
                    )}
                    <span
                      style={{
                        color: USER_STATUS_COLORS[user.status],
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      ● {USER_STATUS_LABELS[user.status]}
                    </span>
                  </div>
                  <div style={{ color: '#7c8db5', fontSize: 12, marginTop: 2 }}>
                    {user.phone}
                    {user.position && ` · ${POSITION_LABELS[user.position]}`}
                  </div>
                </div>
                </div>

                <button
                  onClick={() => setSelectedUser(user)}
                  style={{
                    background: 'none',
                    border: '1px solid #2a2f5a',
                    borderRadius: 8,
                    padding: '5px 10px',
                    color: '#7c8db5',
                    cursor: 'pointer',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ⚙
                </button>
              </div>
            ))}
            {users.length === 0 && (
              <p style={{ color: '#7c8db5', textAlign: 'center', padding: 40 }}>
                No se encontraron usuarios
              </p>
            )}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Crear Usuario" width={560}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Usuario *</label>
              <input className="zetas-input" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Nombre completo *</label>
            <input className="zetas-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Teléfono (WhatsApp) *</label>
            <input className="zetas-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3001234567" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Rol</label>
              <select className="zetas-input" value={role} onChange={(e) => setRole(e.target.value as Role)} style={{ cursor: 'pointer' }}>
                <option value="member">Miembro</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Posición</label>
              <select className="zetas-input" value={position} onChange={(e) => setPosition(e.target.value as Position | '')} style={{ cursor: 'pointer' }}>
                <option value="">--</option>
                {Object.entries(POSITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>Género</label>
              <select className="zetas-input" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')} style={{ cursor: 'pointer' }}>
                <option value="">--</option>
                {Object.entries(GENDER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {createError && <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{createError}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
              {creating ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!selectedUser}
        onClose={() => { setSelectedUser(null); setStatusAction(null); setBanReason(''); }}
        title={selectedUser?.name}
      >
        {selectedUser && (
          <>
            <p style={{ color: '#7c8db5', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
              @{selectedUser.username} · {selectedUser.phone}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedUser.status !== 'active' && (
                <button className="btn btn-primary" onClick={() => setStatusAction('active')} style={{ textAlign: 'left' }}>
                  ✅ Activar cuenta
                </button>
              )}
              {selectedUser.status !== 'inactive' && (
                <button className="btn" onClick={() => setStatusAction('inactive')} style={{ textAlign: 'left' }}>
                  ⏸ Desactivar cuenta
                </button>
              )}
              {selectedUser.status !== 'banned' && (
                <button className="btn" onClick={() => setStatusAction('banned')} style={{ color: '#ff6b6b', borderColor: '#e031312a', textAlign: 'left' }}>
                  🚫 Banear usuario
                </button>
              )}
            </div>
            {statusAction === 'banned' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>Razón del baneo *</label>
                <input className="zetas-input" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Comportamiento inadecuado..." required />
              </div>
            )}
            {statusAction && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 16, width: '100%' }}
                onClick={handleStatusChange}
                disabled={statusSaving || (statusAction === 'banned' && !banReason.trim())}
              >
                {statusSaving ? 'Aplicando...' : 'Confirmar'}
              </button>
            )}
          </>
        )}
      </Modal>

      {profileUser && (
        <PlayerProfileModal
          user={profileUser}
          onClose={() => setProfileUser(null)}
        />
      )}
    </>
  );
}
