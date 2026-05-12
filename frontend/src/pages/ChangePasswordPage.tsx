import { FormEvent, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/auth.service';

export default function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user && !user.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente a la actual');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      if (user) {
        setUser({ ...user, mustChangePassword: false });
      }
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message: string } } }).response?.data
              ?.message
          : 'Error al cambiar la contraseña';
      setError(typeof msg === 'string' ? msg : 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a1628 0%, #1a2744 100%)',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#1e2d45',
          borderRadius: 16,
          padding: 40,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo.png"
            alt="Zetas"
            style={{ width: 80, height: 80, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }}
          />
          <h1
            style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
            }}
          >
            Cambiar contraseña
          </h1>
          <p style={{ color: '#7c8db5', fontSize: 14, marginTop: 8 }}>
            Debes cambiar tu contraseña antes de continuar
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                color: '#7c8db5',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Contraseña actual
            </label>
            <input
              className="zetas-input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                color: '#7c8db5',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Nueva contraseña
            </label>
            <input
              className="zetas-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                color: '#7c8db5',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Confirmar nueva contraseña
            </label>
            <input
              className="zetas-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && (
            <div
              style={{
                background: '#ff6b6b22',
                border: '1px solid #ff6b6b55',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#ff6b6b',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            className="zetas-btn"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              marginBottom: 12,
              background: 'linear-gradient(135deg, #3b5bdb, #5f3dc4)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px 0',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>

          <button
            type="button"
            onClick={logout}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid #374a6b',
              borderRadius: 8,
              color: '#7c8db5',
              padding: '10px 0',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
