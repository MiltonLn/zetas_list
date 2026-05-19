import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/auth.service';
import { getApiError } from '../services/api';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showRecover, setShowRecover] = useState(false);
  const [recoverUsername, setRecoverUsername] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState('');
  const [recoverError, setRecoverError] = useState('');

  if (!authLoading && user && !user.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      navigate(loggedUser.mustChangePassword ? '/change-password' : '/');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(e: FormEvent) {
    e.preventDefault();
    setRecoverError('');
    setRecoverMsg('');
    setRecoverLoading(true);
    try {
      const { data } = await authService.recoverPassword(recoverUsername);
      setRecoverMsg(data.message);
    } catch (err) {
      setRecoverError(getApiError(err));
    } finally {
      setRecoverLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f1020',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#161829',
          borderRadius: 16,
          padding: 40,
          width: '100%',
          maxWidth: 400,
          border: '1px solid #2a2f5a',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Zetas" style={{ width: 80, height: 80, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }} />
          <h1 style={{ color: '#e8eaf6', fontSize: 24, fontWeight: 800, margin: 0 }}>
            Zetas
          </h1>
          <p style={{ color: '#6e8efb', fontSize: 14, fontWeight: 600, marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>
            Volleyball Club
          </p>
          <p style={{ color: '#7c8db5', fontSize: 14, marginTop: 10 }}>
            {showRecover ? 'Recuperar contraseña' : 'Ingresa a tu cuenta'}
          </p>
        </div>

        {!showRecover ? (
          <>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Usuario
                </label>
                <input
                  className="zetas-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu nombre de usuario"
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Contraseña
                </label>
                <input
                  className="zetas-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div
                  style={{
                    background: '#e031311a',
                    border: '1px solid #e0313155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#ff6b6b',
                    fontSize: 14,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ marginTop: 4, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setShowRecover(true);
                setRecoverUsername('');
                setRecoverMsg('');
                setRecoverError('');
              }}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 16,
                background: 'none',
                border: 'none',
                color: '#6e8efb',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Olvidé mi contraseña
            </button>
          </>
        ) : (
          <>
            <form onSubmit={handleRecover} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Usuario
                </label>
                <input
                  className="zetas-input"
                  type="text"
                  value={recoverUsername}
                  onChange={(e) => setRecoverUsername(e.target.value)}
                  placeholder="Tu nombre de usuario"
                  required
                  autoFocus
                />
              </div>

              <p style={{ color: '#7c8db5', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Te enviaremos una contraseña temporal a tu WhatsApp registrado.
              </p>

              {recoverError && (
                <div
                  style={{
                    background: '#e031311a',
                    border: '1px solid #e0313155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#ff6b6b',
                    fontSize: 14,
                  }}
                >
                  {recoverError}
                </div>
              )}

              {recoverMsg && (
                <div
                  style={{
                    background: '#22c55e1a',
                    border: '1px solid #22c55e55',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#22c55e',
                    fontSize: 14,
                  }}
                >
                  {recoverMsg}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={recoverLoading || !!recoverMsg}
                style={{ marginTop: 4, opacity: recoverLoading ? 0.7 : 1 }}
              >
                {recoverLoading ? 'Enviando...' : 'Enviar contraseña por WhatsApp'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowRecover(false)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 16,
                background: 'none',
                border: 'none',
                color: '#6e8efb',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Volver al inicio de sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
