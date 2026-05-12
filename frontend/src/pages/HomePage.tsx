import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { gamesService } from '../services/games.service';
import type { Game, GameStatus } from '../types';
import { MODALIDAD_LABELS, GAME_STATUS_LABELS } from '../types';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/PageHeader';
import { getApiError } from '../services/api';

const STATUS_PRIORITY: Record<GameStatus, number> = {
  registration_open: 0,
  in_progress: 1,
  scheduled: 2,
  completed: 3,
  cancelled: 4,
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getMonthRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom: from, dateTo: to };
}

const PAGE_SIZE = 15;

export default function HomePage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [historyGames, setHistoryGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const filterMonth = searchParams.get('month') || '';
  const filterYear = searchParams.get('year') || '';
  const filterStatus = (searchParams.get('status') || '') as GameStatus | '';
  const searchQuery = searchParams.get('q') || '';

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!value) next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.set('page', '1');
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!isAdmin) {
      gamesService
        .list()
        .then(({ data }) => {
          const games = data.data;
          if (games.length === 1) {
            navigate(`/game/${games[0].id}`, { replace: true });
          } else if (games.length === 0) {
            setActiveGame(null);
          } else {
            setActiveGame(games[0]);
          }
        })
        .catch((e) => setError(getApiError(e)))
        .finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    gamesService
      .list({ page: 1, limit: 1, status: 'registration_open' as GameStatus })
      .then(({ data }) => {
        const active = data.data[0] ?? null;
        setActiveGame(active);
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, [isAdmin, navigate]);

  const fetchHistory = useCallback(() => {
    if (!isAdmin) return;
    setHistoryLoading(true);

    const params: Record<string, string | number> = {
      page: currentPage,
      limit: PAGE_SIZE,
      excludeStatus: 'registration_open,in_progress',
    };

    if (filterMonth && filterYear) {
      const range = getMonthRange(parseInt(filterYear, 10), parseInt(filterMonth, 10));
      params.dateFrom = range.dateFrom;
      params.dateTo = range.dateTo;
    } else if (filterYear) {
      params.dateFrom = `${filterYear}-01-01`;
      params.dateTo = `${filterYear}-12-31`;
    }

    if (filterStatus) {
      params.status = filterStatus;
      delete params.excludeStatus;
    }
    if (searchQuery) params.search = searchQuery;

    gamesService
      .list(params as Parameters<typeof gamesService.list>[0])
      .then(({ data }) => {
        setHistoryGames(data.data);
        setTotal(data.total);
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setHistoryLoading(false));
  }, [isAdmin, currentPage, filterMonth, filterYear, filterStatus, searchQuery]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Spinner size={48} />
      </div>
    );
  }

  if (!isAdmin && !activeGame) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          flex: 1,
        }}
      >
        <div style={{ fontSize: 64 }}>🏐</div>
        <h2 style={{ color: '#e8eaf6', fontSize: 20, fontWeight: 700, margin: 0 }}>
          No hay ninguna lista abierta en el momento
        </h2>
        <p style={{ color: '#7c8db5', fontSize: 15, margin: 0 }}>
          Vuelve después cuando el administrador abra el registro.
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <>
      <PageHeader
        title="Partidos"
        subtitle={isAdmin ? 'Gestión de partidos y listas' : undefined}
        action={
          isAdmin ? (
            <Link to="/admin/games/new" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px', minHeight: 38 }}>
              + Nuevo
            </Link>
          ) : undefined
        }
      />

      <div className="page-wrapper">
        {error && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>}

        {activeGame && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Lista Activa
            </p>
            <Link to={`/game/${activeGame.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ border: '2px solid #3b5bdb', padding: '18px 20px', cursor: 'pointer', transition: 'transform 0.1s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 16 }}>
                    {activeGame.title}
                  </span>
                  <StatusBadge status={activeGame.status} />
                </div>
                <span style={{ color: '#7c8db5', fontSize: 13 }}>
                  {MODALIDAD_LABELS[activeGame.modalidad]} · {activeGame._count?.registrations ?? activeGame.registrations?.length ?? 0} anotados
                </span>
              </div>
            </Link>
          </div>
        )}

        {isAdmin && (
          <>
            <p style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
              Historial
            </p>

            {/* Filter bar */}
            <div className="history-filters">
              <div className="filter-row">
                <input
                  type="text"
                  className="filter-input filter-search"
                  placeholder="Buscar partido..."
                  value={searchQuery}
                  onChange={(e) => updateParam('q', e.target.value)}
                />
              </div>
              <div className="filter-row">
                <select
                  className="filter-input"
                  value={filterYear}
                  onChange={(e) => updateParam('year', e.target.value)}
                >
                  <option value="">Año</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  className="filter-input"
                  value={filterMonth}
                  onChange={(e) => updateParam('month', e.target.value)}
                  disabled={!filterYear}
                >
                  <option value="">Mes</option>
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  className="filter-input"
                  value={filterStatus}
                  onChange={(e) => updateParam('status', e.target.value)}
                >
                  <option value="">Estado</option>
                  {(Object.entries(GAME_STATUS_LABELS) as [GameStatus, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              {(filterYear || filterMonth || filterStatus || searchQuery) && (
                <button
                  className="filter-clear"
                  onClick={() => setSearchParams({})}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* History list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', minHeight: 100 }}>
              {historyLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                  <Spinner size={28} />
                </div>
              )}
              {!historyLoading && historyGames.length === 0 && (
                <p style={{ color: '#7c8db5', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  No se encontraron partidos
                </p>
              )}
              {!historyLoading &&
                historyGames.map((game) => (
                  <Link key={game.id} to={`/game/${game.id}`} style={{ textDecoration: 'none' }}>
                    <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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

            {/* Pagination */}
            {totalPages > 1 && !historyLoading && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={currentPage <= 1}
                  onClick={() => updateParam('page', String(currentPage - 1))}
                >
                  ← Anterior
                </button>
                <span className="pagination-info">
                  Página {currentPage} de {totalPages}
                  <span className="pagination-total"> ({total} partidos)</span>
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => updateParam('page', String(currentPage + 1))}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
