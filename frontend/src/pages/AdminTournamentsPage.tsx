import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsService } from '../services/tournaments.service';
import type { TournamentSummary } from '../types';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  TOURNAMENT_FORMAT_LABELS,
} from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { TournamentFormModal } from '../components/TournamentFormModal';

const money = (n: number) =>
  n === 0 ? 'Gratis' : `$${n.toLocaleString('es-CO')}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formModal, setFormModal] = useState(false);

  const load = () => {
    setLoading(true);
    tournamentsService
      .list()
      .then((r) => setTournaments(r.data))
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <>
      <PageHeader
        title="Gestión de Torneos"
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setFormModal(true)}
          >
            + Nuevo torneo
          </button>
        }
      />
      <div className="page-wrapper">
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
            No hay torneos todavía.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tournaments.map((t) => (
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
                  to={`/admin/torneos/${t.id}`}
                  className="btn btn-sm btn-secondary"
                >
                  Administrar
                </Link>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ color: '#7c8db5', fontSize: 11 }}>Fecha</div>
                  <div style={{ color: '#e8eaf6' }}>{formatDate(t.startDate)}</div>
                </div>
                <div>
                  <div style={{ color: '#7c8db5', fontSize: 11 }}>Formato</div>
                  <div style={{ color: '#e8eaf6' }}>{TOURNAMENT_FORMAT_LABELS[t.format]}</div>
                </div>
                <div>
                  <div style={{ color: '#7c8db5', fontSize: 11 }}>Precio</div>
                  <div style={{ color: '#e8eaf6' }}>{money(t.pricePerTeam)}</div>
                </div>
                <div>
                  <div style={{ color: '#7c8db5', fontSize: 11 }}>Equipos</div>
                  <div style={{ color: '#e8eaf6' }}>
                    {t.teams.length} / {t.maxTeams}
                    {t.teams.filter((team) => team.paid).length > 0 && (
                      <span style={{ color: '#2ecc71', marginLeft: 6 }}>
                        ({t.teams.filter((team) => team.paid).length} pagados)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {formModal && (
        <TournamentFormModal
          onClose={() => setFormModal(false)}
          onSaved={() => {
            setFormModal(false);
            load();
          }}
        />
      )}
    </>
  );
}
