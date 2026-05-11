import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersService } from '../services/users.service';
import type { UpdateUserPayload } from '../services/users.service';
import { authService } from '../services/auth.service';
import type { User, Position, Gender } from '../types';
import { POSITION_LABELS } from '../types';
import { Header } from '../components/Header';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';

const GENDER_LABELS: Record<Gender, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  otro: 'Otro',
};

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position | ''>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    usersService
      .me()
      .then(({ data }) => {
        setProfile(data);
        setName(data.name);
        setPosition((data.position as Position) || '');
        setGender((data.gender as Gender) || '');
        setHeightCm(data.heightCm?.toString() || '');
        setBirthDate(data.birthDate ? data.birthDate.slice(0, 10) : '');
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload: UpdateUserPayload = {
        name,
        position: position || undefined,
        gender: (gender as Gender) || undefined,
        heightCm: heightCm ? parseInt(heightCm) : undefined,
        birthDate: birthDate || undefined,
      };
      await usersService.update(authUser!.id, payload);
      setSuccess('Perfil actualizado correctamente');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    setPwSaving(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setPwSuccess('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwError(getApiError(err));
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1020' }}>
      <Header title="Mi Perfil" backTo="/" />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{ background: '#161829', border: '1px solid #2a2f5a', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
            Datos del Perfil
          </h2>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Nombre
              </label>
              <input className="zetas-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Posición
                </label>
                <select
                  className="zetas-input"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as Position | '')}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(POSITION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Género
                </label>
                <select
                  className="zetas-input"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender | '')}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(GENDER_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Estatura (cm)
                </label>
                <input
                  className="zetas-input"
                  type="number"
                  min={100}
                  max={250}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="175"
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Fecha de Nacimiento
                </label>
                <input
                  className="zetas-input"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Usuario
                </label>
                <input className="zetas-input" value={profile?.username || ''} disabled style={{ opacity: 0.5 }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Teléfono
                </label>
                <input className="zetas-input" value={profile?.phone || ''} disabled style={{ opacity: 0.5 }} />
              </div>
            </div>

            {error && <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{error}</p>}
            {success && <p style={{ color: '#2da44e', fontSize: 13, margin: 0 }}>{success}</p>}

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        </div>

        <div style={{ background: '#161829', border: '1px solid #2a2f5a', borderRadius: 14, padding: 24 }}>
          <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
            Cambiar Contraseña
          </h2>
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Contraseña actual
              </label>
              <input
                className="zetas-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Nueva contraseña
              </label>
              <input
                className="zetas-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {pwError && <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{pwError}</p>}
            {pwSuccess && <p style={{ color: '#2da44e', fontSize: 13, margin: 0 }}>{pwSuccess}</p>}
            <button type="submit" className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
