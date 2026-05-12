import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiError } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
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
          <img src="/logo.png" alt="Zetas" style={{ width: 64, height: 64, borderRadius: 16 }} />
          <h1 style={{ color: '#e8eaf6', fontSize: 24, fontWeight: 800, margin: 0 }}>
            Volley Zetas Ingenio
          </h1>
          <p style={{ color: '#7c8db5', fontSize: 14, marginTop: 6 }}>
            Ingresa a tu cuenta
          </p>
        </div>

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
      </div>
    </div>
  );
}
