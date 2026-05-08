import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { gamesService } from '../services/games.service';
import { Game, MODALIDAD_LABELS, GameStatus } from '../types';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { Header } from '../components/Header';
import { getApiError } from '../services/api';

const STATUS_PRIORITY: Record<GameStatus, number> = {
  registration_open: 0,
  in_progress: 1,
  scheduled: 2,
  completed: 3,
  cancelled: 4,
};

export default function HomePage() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    gamesService
      .list()
      .then(({ data }) => {
        setGames(data);
        if (!isAdmin && data.length === 1) {
          navigate(`/game/${data[0].id}`, { replace: true });
        }
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, [isAdmin, navigate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spinner size={48} />
      </div>
    );
  }

  if (!isAdmin && games.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0f1020',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 64 }}>🏐</div>
        <h2 style={{ color: '#e8eaf6', fontSize: 20, fontWeight: 700, margin: 0 }}>
          No hay ninguna lista abierta en el momento
        </h2>
        <p style={{ color: '#7c8db5', fontSize: 15, margin: 0 }}>
          Vuelve después cuando el administrador abra el registro.
        </p>
        <button onClick={logout} className="btn" style={{ marginTop: 12, color: '#7c8db5', fontSize: 13 }}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  const sortedGames = [...games].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  );

  const activeGame = sortedGames.find(
    (g) => g.status === 'registration_open' || g.status === 'in_progress',
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0f1020' }}>
      <Header
        title="Zetas Ingenio"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              to="/profile"
              style={{
                color: '#7c8db5',
                textDecoration: 'none',
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #2a2f5a',
              }}
            >
              {user?.name.split(' ')[0]}
            </Link>
            <button
              onClick={logout}
              style={{
                background: 'none',
                border: '1px solid #2a2f5a',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#7c8db5',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Salir
            </button>
          </div>
        }
      />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 16px 80px' }}>
        {activeGame && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Lista Activa
            </p>
            <Link
              to={`/game/${activeGame.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  background: '#1a1d38',
                  border: '2px solid #3b5bdb',
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 16 }}>
                    {activeGame.title}
                  </span>
                  <StatusBadge status={activeGame.status} />
                </div>
                <span style={{ color: '#7c8db5', fontSize: 13 }}>
                  {MODALIDAD_LABELS[activeGame.modalidad]} · {activeGame._count?.registrations ?? activeGame.registrations.length} anotados
                </span>
              </div>
            </Link>
          </div>
        )}

        {isAdmin && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 }}>
              <p style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                Historial
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to="/admin/users" className="btn" style={{ fontSize: 12, padding: '6px 12px' }}>
                  👥 Usuarios
                </Link>
                <Link to="/admin/games/new" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                  + Nuevo partido
                </Link>
              </div>
            </div>

            {error && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedGames
                .filter((g) => g.status === 'completed' || g.status === 'cancelled' || g.status === 'scheduled')
                .map((game) => (
                  <Link key={game.id} to={`/game/${game.id}`} style={{ textDecoration: 'none' }}>
                    <div
                      style={{
                        background: '#161829',
                        border: '1px solid #2a2f5a',
                        borderRadius: 12,
                        padding: '14px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <p style={{ color: '#e8eaf6', fontWeight: 600, fontSize: 14, margin: 0 }}>
                          {game.title}
                        </p>
                        <p style={{ color: '#7c8db5', fontSize: 12, margin: '4px 0 0' }}>
                          {MODALIDAD_LABELS[game.modalidad]}
                          {game._count && ` · ${game._count.registrations} anotados`}
                        </p>
                      </div>
                      <StatusBadge status={game.status} />
                    </div>
                  </Link>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
