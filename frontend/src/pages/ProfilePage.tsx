import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersService } from '../services/users.service';
import type { UpdateUserPayload } from '../services/users.service';
import { authService } from '../services/auth.service';
import type { User, Position, Gender, ShirtSize } from '../types';
import { GENDER_LABELS, SHIRT_SIZES } from '../types';
import { PositionsField } from '../components/PositionsField';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { ImageCropModal } from '../components/ImageCropModal';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { prepareImageForCrop } from '../utils/image';
import { displayName as getDisplayName } from '../utils/display-name';

export default function ProfilePage() {
  const { user: authUser, isAdmin } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [bio, setBio] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [gender, setGender] = useState<Gender | ''>('');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [shirtSize, setShirtSize] = useState<ShirtSize | ''>('');
  const [shirtNumber, setShirtNumber] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usersService
      .me()
      .then(({ data }) => {
        setProfile(data);
        setName(data.name);
        setAlias(data.alias || '');
        setBio(data.bio || '');
        setPositions(data.positions || []);
        setGender((data.gender as Gender) || '');
        setHeightCm(data.heightCm?.toString() || '');
        setBirthDate(data.birthDate ? data.birthDate.slice(0, 10) : '');
        setShirtSize((data.shirtSize as ShirtSize) || '');
        setShirtNumber(
          data.shirtNumber !== undefined && data.shirtNumber !== null
            ? String(data.shirtNumber)
            : '',
        );
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
        ...(isAdmin ? { name } : {}),
        alias: alias || '',
        bio: bio || undefined,
        positions,
        gender: (gender as Gender) || undefined,
        heightCm: heightCm ? parseInt(heightCm) : undefined,
        birthDate: birthDate || undefined,
        shirtSize: (shirtSize as ShirtSize) || undefined,
        shirtNumber: shirtNumber !== '' ? parseInt(shirtNumber) : undefined,
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

  async function handleFileSelect(file: File) {
    setError('');
    setSuccess('');
    setPhotoPreparing(true);
    try {
      const src = await prepareImageForCrop(file);
      setCropImageSrc(src);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la imagen.');
    } finally {
      setPhotoPreparing(false);
    }
  }

  async function handleCroppedPhoto(blob: Blob) {
    setCropImageSrc(null);
    if (!authUser) return;
    setPhotoUploading(true);
    setError('');
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const { data } = await usersService.uploadPhoto(authUser.id, file);
      setProfile(data);
      setSuccess('Foto actualizada');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPhotoUploading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Mi Perfil" backTo="/" />

      <div className="page-wrapper" style={{ maxWidth: 600 }}>
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
            Datos del Perfil
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={profile ? getDisplayName(profile) : ''} photoUrl={profile?.photoUrl} size={72} />
              {(photoUploading || photoPreparing) && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Spinner size={24} />
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px', minHeight: 32 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading || photoPreparing}
              >
                {photoPreparing ? 'Procesando...' : 'Cambiar foto'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
                }}
              />
              <p style={{ color: '#7c8db5', fontSize: 11, margin: '6px 0 0' }}>
                JPG, PNG — máx. 5 MB
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Nombre real
              </label>
              <input
                className="zetas-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                style={!isAdmin ? { opacity: 0.5 } : undefined}
                required
              />
              {!isAdmin && (
                <p style={{ color: '#7c8db5', fontSize: 11, margin: '4px 0 0' }}>
                  Solo un administrador puede cambiar el nombre real.
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Alias en la lista
              </label>
              <input
                className="zetas-input"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                maxLength={50}
                placeholder={name || 'Ej: Juancho'}
              />
              <p style={{ color: '#7c8db5', fontSize: 11, margin: '4px 0 0' }}>
                Este es el nombre que aparece en la lista de juego. Si lo dejas vacío se usará tu nombre real.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Bio
              </label>
              <textarea
                className="zetas-input"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Cuéntanos algo sobre ti..."
                maxLength={200}
                rows={2}
                style={{ resize: 'vertical', minHeight: 48 }}
              />
              <p style={{ color: '#7c8db5', fontSize: 11, margin: '4px 0 0', textAlign: 'right' }}>
                {bio.length}/200
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                Posiciones
              </label>
              <PositionsField value={positions} onChange={setPositions} />
              <p style={{ color: '#7c8db5', fontSize: 11, margin: '4px 0 0' }}>
                Puedes seleccionar más de una posición.
              </p>
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
                  Talla de camiseta
                </label>
                <select
                  className="zetas-input"
                  value={shirtSize}
                  onChange={(e) => setShirtSize(e.target.value as ShirtSize | '')}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Sin especificar</option>
                  {SHIRT_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 5 }}>
                  Número de camiseta
                </label>
                <input
                  className="zetas-input"
                  type="number"
                  min={0}
                  max={99}
                  value={shirtNumber}
                  onChange={(e) => setShirtNumber(e.target.value)}
                  placeholder="0-99"
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

        <div className="card" style={{ padding: 24 }}>
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

      {cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          onCrop={handleCroppedPhoto}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </>
  );
}
