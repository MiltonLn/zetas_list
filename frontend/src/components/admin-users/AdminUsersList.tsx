import type { User } from '../../types';
import { POSITION_LABELS, USER_STATUS_COLORS, USER_STATUS_LABELS } from '../../types';
import { displayName } from '../../utils/display-name';
import { Avatar } from '../Avatar';
import { Spinner } from '../Spinner';

interface AdminUsersListProps {
  users: User[];
  loading: boolean;
  onProfile: (user: User) => void;
  onEdit: (user: User) => void;
  onManage: (user: User) => void;
}

export function AdminUsersList({
  users,
  loading,
  onProfile,
  onEdit,
  onManage,
}: AdminUsersListProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {users.map((user) => (
        <div
          key={user.id}
          style={{ background: '#161829', border: '1px solid #2a2f5a', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div onClick={() => onProfile(user)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <Avatar name={displayName(user)} photoUrl={user.photoUrl} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#e8eaf6', fontWeight: 600, fontSize: 14 }}>{user.name}</span>
                {user.alias && user.alias !== user.name && (
                  <span style={{ color: '#7c8db5', fontSize: 11 }}>alias: "{user.alias}"</span>
                )}
                {user.role === 'admin' && <RoleBadge color="#6e8efb">Admin</RoleBadge>}
                {user.role === 'ayudante' && <RoleBadge color="#e3a008">Ayudante</RoleBadge>}
                <span style={{ color: USER_STATUS_COLORS[user.status], fontSize: 11, fontWeight: 600 }}>
                  ● {USER_STATUS_LABELS[user.status]}
                </span>
              </div>
              <div style={{ color: '#7c8db5', fontSize: 12, marginTop: 2 }}>
                {user.phone}
                {user.position && ` · ${POSITION_LABELS[user.position]}`}
              </div>
            </div>
          </div>
          <ActionButton title="Editar perfil" onClick={() => onEdit(user)}>✏️</ActionButton>
          <ActionButton title="Estado de cuenta" onClick={() => onManage(user)}>⚙</ActionButton>
        </div>
      ))}
      {users.length === 0 && (
        <p style={{ color: '#7c8db5', textAlign: 'center', padding: 40 }}>
          No se encontraron usuarios
        </p>
      )}
    </div>
  );
}

function RoleBadge({ color, children }: { color: string; children: string }) {
  return (
    <span style={{ background: `${color}22`, color, fontSize: 11, padding: '1px 7px', borderRadius: 6, fontWeight: 600 }}>
      {children}
    </span>
  );
}

interface ActionButtonProps {
  title: string;
  onClick: () => void;
  children: string;
}

function ActionButton({ title, onClick, children }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ background: 'none', border: '1px solid #2a2f5a', borderRadius: 8, padding: '5px 10px', color: '#7c8db5', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
    >
      {children}
    </button>
  );
}
