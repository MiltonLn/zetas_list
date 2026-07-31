import { useParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useTournamentDetail } from '../hooks/useTournamentDetail';
import { TournamentView } from './TournamentDetailPage';

/* ─────────────────────────────────────────────────────────────────────────────
   Vista pública de un torneo — ruta /t/:id, accesible sin login.
   Muestra el mismo contenido que TournamentDetailPage pero sin sidebar.
   ───────────────────────────────────────────────────────────────────────── */

export default function PublicTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { tournament, loading, error, refresh } = useTournamentDetail(id);

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f1e' }}>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <Spinner />
        </div>
      ) : error || !tournament ? (
        <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 24px' }}>
          <div className="card" style={{ color: '#ef5350', textAlign: 'center' }}>
            {error || 'Torneo no encontrado'}
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: 32 }}>
          <TournamentView tournament={tournament} isAdmin={false} onRefresh={refresh} />
        </div>
      )}
    </div>
  );
}
