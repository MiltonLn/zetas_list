import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsService } from '../services/tournaments.service';
import type { TournamentSummary, TournamentStatus } from '../types';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  TOURNAMENT_FORMAT_LABELS,
} from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';

const money = (n: number) =>
  n === 0 ? 'Gratis' : `$${n.toLocaleString('es-CO')}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const STATUS_OPTIONS: { value: TournamentStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'registration_open', label: 'Inscripciones abiertas' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Completados' },
];

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<TournamentStatus | ''>('');

  useEffect(() => {
    setLoading(true);
    tournamentsService
      .list(statusFilter || undefined)
      .then((r) => setTournaments(r.data))
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <>
      <PageHeader title="Torneos" subtitle="Competencias del grupo" />
      <div className="page-wrapper">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn-sm ${statusFilter === opt.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        )}
        {error && (
          <div className="card" style={{ color: '#ef5350', textAlign: 'center' }}>{error}</div>
        )}

        {!loading && !error && tournaments.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: '#7c8db5' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏐</div>
            <p style={{ margin: 0 }}>No hay torneos para mostrar.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tournaments.map((t) => {
            const slots = t.maxTeams - t.teams.length;
            return (
              <div key={t.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h3 style={{ color: '#e8eaf6', fontWeight: 700, margin: '0 0 6px' }}>
                      {t.name}
                    </h3>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TOURNAMENT_STATUS_COLORS[t.status],
                        background: TOURNAMENT_STATUS_COLORS[t.status] + '22',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {TOURNAMENT_STATUS_LABELS[t.status]}
                    </span>
                  </div>
                  <Link
                    to={`/torneos/${t.id}`}
                    className="btn btn-sm btn-primary"
                  >
                    Ver detalles
                  </Link>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 12,
                  }}
                >
                  <InfoItem label="Fecha" value={formatDate(t.startDate)} />
                  <InfoItem label="Formato" value={TOURNAMENT_FORMAT_LABELS[t.format]} />
                  <InfoItem label="Precio por equipo" value={money(t.pricePerTeam)} />
                  <InfoItem
                    label="Cupos"
                    value={`${t.teams.length} / ${t.maxTeams} equipos`}
                    highlight={slots === 0 ? '#ef5350' : slots <= 2 ? '#ff9800' : undefined}
                  />
                  {t.prizeDescription && (
                    <InfoItem label="Premio" value={t.prizeDescription} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function InfoItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#7c8db5', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: highlight ?? '#e8eaf6', fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
