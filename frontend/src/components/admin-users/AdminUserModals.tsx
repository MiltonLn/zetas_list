import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
} from '../../hooks/useUsersQuery';
import { getApiError } from '../../services/api';
import type { CreateUserPayload, UpdateUserPayload } from '../../services/users.service';
import type { Gender, Position, Role, User, UserStatus } from '../../types';
import { GENDER_LABELS, POSITION_LABELS } from '../../types';
import { showToast } from '../../utils/toast';
import { Modal } from '../Modal';

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
}

interface CreateForm {
  name: string;
  alias: string;
  phone: string;
  role: Role;
  position: Position | '';
  gender: Gender | '';
}

const EMPTY_CREATE_FORM: CreateForm = {
  name: '',
  alias: '',
  phone: '',
  role: 'member',
  position: '',
  gender: '',
};

export function CreateUserModal({ open, onClose }: CreateUserModalProps) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [error, setError] = useState('');
  const createUser = useCreateUserMutation();

  useEffect(() => {
    if (open) {
      setForm(EMPTY_CREATE_FORM);
      setError('');
    }
  }, [open]);

  const update = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const payload: CreateUserPayload = {
      name: form.name,
      alias: form.alias.trim() || undefined,
      phone: form.phone,
      role: form.role,
      position: form.position || undefined,
      gender: form.gender || undefined,
    };
    try {
      await createUser.mutateAsync(payload);
      onClose();
    } catch (submitError) {
      setError(getApiError(submitError));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Crear Usuario" width={560}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nombre completo *">
          <input className="zetas-input" value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </Field>
        <Field label="Alias en la lista" help="Nombre que aparece en la lista de juego. Si se deja vacío, se usa el nombre real.">
          <input className="zetas-input" value={form.alias} onChange={(event) => update('alias', event.target.value)} placeholder={form.name || 'Ej: Juancho'} maxLength={50} />
        </Field>
        <Field label="Teléfono (con indicativo) *" help="Este será también el nombre de usuario para ingresar">
          <input className="zetas-input" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="573001234567" required />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Rol">
            <select className="zetas-input" value={form.role} onChange={(event) => update('role', event.target.value as Role)} style={{ cursor: 'pointer' }}>
              <option value="member">Miembro</option>
              <option value="ayudante">Ayudante</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <PositionSelect value={form.position} onChange={(value) => update('position', value)} />
          <GenderSelect value={form.gender} onChange={(value) => update('gender', value)} />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <ModalActions onClose={onClose} pending={createUser.isPending} pendingText="Creando..." submitText="Crear usuario" />
      </form>
    </Modal>
  );
}

interface EditUserModalProps {
  user: User | null;
  onClose: () => void;
}

interface EditForm {
  name: string;
  alias: string;
  position: Position | '';
  gender: Gender | '';
  heightCm: string;
  bio: string;
}

export function EditUserModal({ user, onClose }: EditUserModalProps) {
  const [form, setForm] = useState<EditForm>({
    name: '',
    alias: '',
    position: '',
    gender: '',
    heightCm: '',
    bio: '',
  });
  const [error, setError] = useState('');
  const updateUser = useUpdateUserMutation();

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      alias: user.alias || '',
      position: user.position || '',
      gender: user.gender || '',
      heightCm: user.heightCm ? String(user.heightCm) : '',
      bio: user.bio || '',
    });
    setError('');
  }, [user]);

  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const payload: UpdateUserPayload = {
      name: form.name || undefined,
      alias: form.alias,
      position: form.position || undefined,
      gender: form.gender || undefined,
      heightCm: form.heightCm ? parseInt(form.heightCm, 10) : undefined,
      bio: form.bio || undefined,
    };
    try {
      setError('');
      await updateUser.mutateAsync({ id: user.id, payload });
      onClose();
    } catch (submitError) {
      setError(getApiError(submitError));
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title="Editar Perfil" width={560}>
      {user && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#0f1020', border: '1px solid #2a2f5a', borderRadius: 8, padding: '10px 14px', marginBottom: 4 }}>
            <div style={{ color: '#7c8db5', fontSize: 12 }}>Teléfono / Usuario</div>
            <div style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600 }}>{user.phone}</div>
          </div>
          <Field label="Nombre completo">
            <input className="zetas-input" value={form.name} onChange={(event) => update('name', event.target.value)} />
          </Field>
          <Field label="Alias en la lista" help="Nombre que aparece en la lista de juego. Si se deja vacío, se usa el nombre real.">
            <input className="zetas-input" value={form.alias} onChange={(event) => update('alias', event.target.value)} placeholder={form.name || 'Ej: Juancho'} maxLength={50} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <PositionSelect value={form.position} onChange={(value) => update('position', value)} />
            <GenderSelect value={form.gender} onChange={(value) => update('gender', value)} />
            <Field label="Altura (cm)">
              <input className="zetas-input" type="number" min="100" max="250" value={form.heightCm} onChange={(event) => update('heightCm', event.target.value)} placeholder="175" />
            </Field>
          </div>
          <Field label="Bio">
            <textarea className="zetas-input" value={form.bio} onChange={(event) => update('bio', event.target.value)} rows={3} style={{ resize: 'vertical' }} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <ModalActions onClose={onClose} pending={updateUser.isPending} pendingText="Guardando..." submitText="Guardar cambios" />
        </form>
      )}
    </Modal>
  );
}

interface ManageUserModalProps {
  user: User | null;
  onClose: () => void;
}

export function ManageUserModal({ user, onClose }: ManageUserModalProps) {
  const [statusAction, setStatusAction] = useState<UserStatus | null>(null);
  const [banReason, setBanReason] = useState('');
  const updateStatus = useUpdateUserStatusMutation();
  const updateRole = useUpdateUserRoleMutation();

  useEffect(() => {
    setStatusAction(null);
    setBanReason('');
  }, [user]);

  const handleRoleChange = async (role: Role) => {
    if (!user || updateRole.isPending) return;
    try {
      await updateRole.mutateAsync({ id: user.id, role });
      onClose();
    } catch (error) {
      showToast(getApiError(error), 'error');
    }
  };

  const handleStatusChange = async () => {
    if (!user || !statusAction || (statusAction === 'banned' && !banReason.trim())) return;
    try {
      await updateStatus.mutateAsync({
        id: user.id,
        status: statusAction,
        reason: statusAction === 'banned' ? banReason : undefined,
      });
      onClose();
    } catch (error) {
      showToast(getApiError(error), 'error');
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title={user?.name}>
      {user && (
        <>
          <p style={{ color: '#7c8db5', fontSize: 13, marginTop: 0, marginBottom: 20 }}>{user.phone}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user.role !== 'admin' && <RoleButton disabled={updateRole.isPending} color="#6e8efb" onClick={() => handleRoleChange('admin')}>👑 Hacer administrador</RoleButton>}
            {user.role !== 'ayudante' && <RoleButton disabled={updateRole.isPending} color="#e3a008" onClick={() => handleRoleChange('ayudante')}>🤝 Hacer ayudante</RoleButton>}
            {user.role !== 'member' && <RoleButton disabled={updateRole.isPending} onClick={() => handleRoleChange('member')}>👤 Quitar rol especial</RoleButton>}
            {user.status !== 'active' && <RoleButton primary onClick={() => setStatusAction('active')}>✅ Activar cuenta</RoleButton>}
            {user.status !== 'inactive' && <RoleButton onClick={() => setStatusAction('inactive')}>⏸ Desactivar cuenta</RoleButton>}
            {user.status !== 'banned' && <RoleButton color="#ff6b6b" onClick={() => setStatusAction('banned')}>🚫 Banear usuario</RoleButton>}
          </div>
          {statusAction === 'banned' && (
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Razón del baneo *</label>
              <input className="zetas-input" value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Comportamiento inadecuado..." required />
            </div>
          )}
          {statusAction && (
            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleStatusChange} disabled={updateStatus.isPending || (statusAction === 'banned' && !banReason.trim())}>
              {updateStatus.isPending ? 'Aplicando...' : 'Confirmar'}
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

const labelStyle = { display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 } as const;

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {help && <span style={{ color: '#7c8db5', fontSize: 11, marginTop: 4, display: 'block' }}>{help}</span>}
    </div>
  );
}

function PositionSelect({ value, onChange }: { value: Position | ''; onChange: (value: Position | '') => void }) {
  return (
    <Field label="Posición">
      <select className="zetas-input" value={value} onChange={(event) => onChange(event.target.value as Position | '')} style={{ cursor: 'pointer' }}>
        <option value="">--</option>
        {Object.entries(POSITION_LABELS).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    </Field>
  );
}

function GenderSelect({ value, onChange }: { value: Gender | ''; onChange: (value: Gender | '') => void }) {
  return (
    <Field label="Género">
      <select className="zetas-input" value={value} onChange={(event) => onChange(event.target.value as Gender | '')} style={{ cursor: 'pointer' }}>
        <option value="">--</option>
        {Object.entries(GENDER_LABELS).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    </Field>
  );
}

function ErrorText({ children }: { children: string }) {
  return <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{children}</p>;
}

interface ModalActionsProps {
  onClose: () => void;
  pending: boolean;
  pendingText: string;
  submitText: string;
}

function ModalActions({ onClose, pending, pendingText, submitText }: ModalActionsProps) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
      <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
      <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
        {pending ? pendingText : submitText}
      </button>
    </div>
  );
}

function RoleButton({
  children,
  onClick,
  color,
  primary = false,
  disabled = false,
}: {
  children: string;
  onClick: () => void;
  color?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`btn${primary ? ' btn-primary' : ''}`} onClick={onClick} disabled={disabled} style={{ textAlign: 'left', color }}>
      {children}
    </button>
  );
}
