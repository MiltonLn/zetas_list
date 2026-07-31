import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentsService } from '../services/tournaments.service';
import type {
  BracketPreviewResponse,
  TeamStanding,
  Tournament,
  TournamentTeam,
  TournamentMatch,
} from '../types';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  TOURNAMENT_FORMAT_LABELS,
} from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { getApiError } from '../services/api';
import { TournamentFormModal } from '../components/TournamentFormModal';
import { TeamRegistrationModal } from '../components/TeamRegistrationModal';
import { MatchScoreModal } from '../components/MatchScoreModal';
import { GroupAssignModal } from '../components/GroupAssignModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { showToast } from '../utils/toast';
import { StandingsTable } from '../components/tournaments/StandingsTable';
import { BracketPreview } from '../components/tournaments/BracketPreview';

const money = (n: number) =>
  n === 0 ? 'Gratis' : `$${n.toLocaleString('es-CO')}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const STATUS_TRANSITIONS: Record<string, { label: string; action: string }[]> = {
  draft: [{ label: 'Abrir inscripciones', action: 'open-registration' }],
  registration_open: [{ label: 'Iniciar torneo', action: 'start' }],
  in_progress: [
    { label: 'Completar torneo', action: 'complete' },
    { label: 'Cancelar', action: 'cancel' },
  ],
  completed: [],
  cancelled: [],
};

const PHASE_LABELS: Record<string, string> = {
  group: 'Fase de grupos',
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinal',
  final: 'Final',
  third_place: 'Tercer puesto',
};

export default function AdminTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [regModal, setRegModal] = useState(false);
  const [scoreModal, setScoreModal] = useState<TournamentMatch | null>(null);
  const [groupModal, setGroupModal] = useState(false);
  const [transitioning, setTransitioning] = useState('');
  const [confirmRemoveTeam, setConfirmRemoveTeam] = useState<{ id: string; name: string } | null>(null);
  const [confirmBracket, setConfirmBracket] = useState(false);
  const [confirmCancelMatch, setConfirmCancelMatch] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [standingsError, setStandingsError] = useState('');
  const [bracketPreview, setBracketPreview] = useState<BracketPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    tournamentsService
      .findOne(id)
      .then((r) => {
        setTournament(r.data);
        if (r.data.format !== 'knockout_only' && r.data.matches.some((match) => match.phase === 'group')) {
          tournamentsService.getStandings(id)
            .then((standingsResponse) => setStandings(standingsResponse.data))
            .catch((standingsRequestError) => setStandingsError(getApiError(standingsRequestError)));
        }
      })
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleTransition = async (action: string) => {
    if (!id || !tournament) return;
    setTransitioning(action);
    try {
      let res;
      if (action === 'open-registration') res = await tournamentsService.openRegistration(id);
      else if (action === 'start') res = await tournamentsService.start(id);
      else if (action === 'complete') res = await tournamentsService.complete(id);
      else if (action === 'cancel') res = await tournamentsService.cancel(id);
      if (res) setTournament(res.data);
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setTransitioning('');
    }
  };

  const handleTogglePayment = async (team: TournamentTeam) => {
    if (!id) return;
    try {
      await tournamentsService.updateTeamPayment(id, team.id, !team.paid);
      load();
    } catch (e) {
      showToast(getApiError(e), 'error');
    }
  };

  const handleRemoveTeam = (teamId: string, teamName: string) => {
    setConfirmRemoveTeam({ id: teamId, name: teamName });
  };

  const doRemoveTeam = async () => {
    if (!id || !confirmRemoveTeam) return;
    setActionLoading(true);
    try {
      await tournamentsService.removeTeam(id, confirmRemoveTeam.id);
      setConfirmRemoveTeam(null);
      load();
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateGroupMatches = async () => {
    if (!id) return;
    try {
      const res = await tournamentsService.generateGroupMatches(id);
      setTournament(res.data);
    } catch (e) {
      showToast(getApiError(e), 'error');
    }
  };

  const handleGenerateBracket = async () => {
    if (!id) return;
    setPreviewLoading(true);
    try {
      const response = await tournamentsService.getBracketPreview(id);
      setBracketPreview(response.data);
    } catch (previewError) {
      showToast(getApiError(previewError), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const doGenerateBracket = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const res = await tournamentsService.generateKnockoutBracket(id);
      setTournament(res.data);
      setConfirmBracket(false);
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvanceWinners = async () => {
    if (!id) return;
    try {
      const res = await tournamentsService.advanceWinners(id);
      setTournament(res.data);
    } catch (e) {
      showToast(getApiError(e), 'error');
    }
  };

  const handleCancelMatch = (matchId: string) => {
    setConfirmCancelMatch(matchId);
  };

  const doCancelMatch = async () => {
    if (!confirmCancelMatch) return;
    setActionLoading(true);
    try {
      await tournamentsService.cancelMatch(confirmCancelMatch);
      setConfirmCancelMatch(null);
      load();
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Torneo" backTo="/admin/torneos" />
        <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <Spinner />
        </div>
      </>
    );
  }

  if (error || !tournament) {
    return (
      <>
        <PageHeader title="Torneo" backTo="/admin/torneos" />
        <div className="page-wrapper">
          <div className="card" style={{ color: '#ef5350', textAlign: 'center' }}>
            {error || 'Torneo no encontrado'}
          </div>
        </div>
      </>
    );
  }

  const transitions = STATUS_TRANSITIONS[tournament.status] ?? [];

  return (
    <>
      <PageHeader
        title={tournament.name}
        backTo="/admin/torneos"
        subtitle="Panel de administración"
        action={
          <Link to={`/t/${tournament.id}`} className="btn btn-sm btn-secondary">
            Vista pública ↗
          </Link>
        }
      />
      <div className="page-wrapper">
        {/* Status + transitions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: TOURNAMENT_STATUS_COLORS[tournament.status],
              background: TOURNAMENT_STATUS_COLORS[tournament.status] + '22',
              padding: '3px 10px',
              borderRadius: 4,
            }}
          >
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </span>
          {transitions.map((t) => (
            <button
              key={t.action}
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!!transitioning}
              onClick={() => handleTransition(t.action)}
            >
              {transitioning === t.action ? '…' : t.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setEditModal(true)}
          >
            Editar
          </button>
        </div>

        {/* Info card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 14,
            }}
          >
            <InfoItem label="Fechas" value={`${formatDate(tournament.startDate)} – ${formatDate(tournament.endDate)}`} />
            <InfoItem label="Formato" value={TOURNAMENT_FORMAT_LABELS[tournament.format]} />
            <InfoItem label="Precio/equipo" value={money(tournament.pricePerTeam)} />
            <InfoItem label="Equipos" value={`${tournament.teams.length} / ${tournament.maxTeams}`} />
            <InfoItem
              label="Jugadores/equipo"
              value={`${tournament.minPlayersPerTeam} – ${tournament.maxPlayersPerTeam}`}
            />
            {tournament.numberOfGroups != null && (
              <InfoItem label="Grupos" value={String(tournament.numberOfGroups)} />
            )}
            {tournament.prizeDescription && (
              <InfoItem label="Premio" value={tournament.prizeDescription} />
            )}
          </div>
        </div>

        {/* Teams section */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <h3 style={{ color: '#e8eaf6', margin: 0, fontSize: 16, fontWeight: 700 }}>
            Equipos ({tournament.teams.length})
          </h3>
          {tournament.status === 'registration_open' && tournament.teams.length < tournament.maxTeams && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setRegModal(true)}
            >
              + Inscribir equipo
            </button>
          )}
        </div>

        {tournament.teams.length === 0 && (
          <div className="card" style={{ color: '#7c8db5', textAlign: 'center', marginBottom: 20 }}>
            Sin equipos inscritos.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {tournament.teams.map((team) => (
            <AdminTeamCard
              key={team.id}
              team={team}
              onTogglePayment={() => handleTogglePayment(team)}
              onRemove={() => handleRemoveTeam(team.id, team.name)}
            />
          ))}
        </div>

        {tournament.format !== 'knockout_only' && tournament.matches.some((match) => match.phase === 'group') && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#e8eaf6', fontSize: 16 }}>Tabla de posiciones</h3>
            {standingsError
              ? <div className="card" style={{ color: '#ef5350' }}>{standingsError}</div>
              : <StandingsTable standings={standings} teams={tournament.teams} />}
          </section>
        )}

        {/* Matches / bracket section */}
        {tournament.status === 'in_progress' && (
          <MatchesSection
            tournament={tournament}
            onGenerateGroups={() => setGroupModal(true)}
            onGenerateGroupMatches={handleGenerateGroupMatches}
            onGenerateBracket={handleGenerateBracket}
            onAdvanceWinners={handleAdvanceWinners}
            onEditMatch={(m) => setScoreModal(m)}
            onCancelMatch={handleCancelMatch}
            previewLoading={previewLoading}
          />
        )}
        {bracketPreview && (
          <section style={{ marginTop: 16 }}>
            <BracketPreview preview={bracketPreview} teams={tournament.teams} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirmBracket(true)}>
                Confirmar y generar bracket
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Modals */}
      {editModal && (
        <TournamentFormModal
          tournament={tournament}
          onClose={() => setEditModal(false)}
          onSaved={(updated) => {
            setTournament(updated);
            setEditModal(false);
          }}
        />
      )}

      {regModal && (
        <TeamRegistrationModal
          tournament={tournament}
          onClose={() => setRegModal(false)}
          onSaved={() => {
            setRegModal(false);
            load();
          }}
        />
      )}

      {groupModal && (
        <GroupAssignModal
          tournament={tournament}
          onClose={() => setGroupModal(false)}
          onSaved={(updated) => {
            setTournament(updated);
            setGroupModal(false);
          }}
        />
      )}

      {scoreModal && (
        <MatchScoreModal
          match={scoreModal}
          tournament={tournament}
          onClose={() => setScoreModal(null)}
          onSaved={() => {
            setScoreModal(null);
            load();
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmRemoveTeam}
        title="Eliminar equipo"
        message={confirmRemoveTeam ? `¿Eliminar el equipo "${confirmRemoveTeam.name}"? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        danger
        loading={actionLoading}
        onConfirm={doRemoveTeam}
        onClose={() => setConfirmRemoveTeam(null)}
      />

      <ConfirmModal
        open={confirmBracket}
        title="Generar bracket"
        message="¿Confirmas estos cruces? Se crearán los partidos de la fase eliminatoria."
        confirmLabel="Generar"
        loading={actionLoading}
        onConfirm={doGenerateBracket}
        onClose={() => setConfirmBracket(false)}
      />

      <ConfirmModal
        open={!!confirmCancelMatch}
        title="Cancelar partido"
        message='¿Marcar este partido como "No se jugó"?'
        confirmLabel="Sí, cancelar"
        danger
        loading={actionLoading}
        onConfirm={doCancelMatch}
        onClose={() => setConfirmCancelMatch(null)}
      />
    </>
  );
}

function AdminTeamCard({
  team,
  onTogglePayment,
  onRemove,
}: {
  team: TournamentTeam;
  onTogglePayment: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div
          style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span style={{ color: '#e8eaf6', fontWeight: 600 }}>{team.name}</span>
          {team.groupLabel && (
            <span style={{ fontSize: 12, color: '#6e8efb', background: '#6e8efb22', padding: '1px 6px', borderRadius: 4 }}>
              Grupo {team.groupLabel}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#7c8db5' }}>
            {team.players.length} jugadores {expanded ? '▲' : '▼'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${team.paid ? 'btn-success' : 'btn-secondary'}`}
            onClick={onTogglePayment}
          >
            {team.paid ? '✓ Pagado' : '○ Sin pago'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={onRemove}
          >
            Eliminar
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2a2f5a' }}>
          {team.players.map((p) => (
            <div
              key={p.id}
              style={{ fontSize: 13, color: '#c5cae9', padding: '4px 0', borderBottom: '1px solid #1e2a4a' }}
            >
              {p.isCaptain && <span style={{ color: '#ffd54f', marginRight: 4 }}>★</span>}
              {p.user?.name ?? p.guestName ?? '—'}
              {!p.userId && (
                <span style={{ color: '#7c8db5', fontSize: 11, marginLeft: 6 }}>(externo)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  onEdit,
}: {
  match: TournamentMatch;
  onEdit: () => void;
}) {
  const teamAName = match.teamA?.name ?? 'TBD';
  const teamBName = match.teamB?.name ?? 'TBD';
  const setsA = match.sets.filter((s) => s.scoreA > s.scoreB).length;
  const setsB = match.sets.filter((s) => s.scoreB > s.scoreA).length;

  return (
    <div className="card" style={{ padding: 14, fontSize: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div style={{ color: '#7c8db5', fontSize: 11, marginBottom: 4 }}>
            {PHASE_LABELS[match.phase] ?? match.phase}
            {match.groupLabel && ` · Grupo ${match.groupLabel}`}
          </div>
          <div style={{ color: '#e8eaf6' }}>
            <span
              style={{
                fontWeight: match.winnerId === match.teamAId ? 700 : 400,
                color: match.winnerId === match.teamAId ? '#2ecc71' : '#e8eaf6',
              }}
            >
              {teamAName}
            </span>
            {match.status === 'completed' ? (
              <span style={{ margin: '0 8px', color: '#6e8efb', fontWeight: 700 }}>
                {setsA} – {setsB}
              </span>
            ) : (
              <span style={{ margin: '0 8px', color: '#7c8db5' }}>vs</span>
            )}
            <span
              style={{
                fontWeight: match.winnerId === match.teamBId ? 700 : 400,
                color: match.winnerId === match.teamBId ? '#2ecc71' : '#e8eaf6',
              }}
            >
              {teamBName}
            </span>
          </div>
          {match.sets.length > 0 && (
            <div style={{ fontSize: 12, color: '#7c8db5', marginTop: 4 }}>
              {match.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(' | ')}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={onEdit}
        >
          {match.status === 'completed' ? 'Editar marcador' : 'Registrar marcador'}
        </button>
      </div>
    </div>
  );
}

function MatchesSection({
  tournament,
  onGenerateGroups,
  onGenerateGroupMatches,
  onGenerateBracket,
  onAdvanceWinners,
  onEditMatch,
  onCancelMatch,
  previewLoading,
}: {
  tournament: Tournament;
  onGenerateGroups: () => void;
  onGenerateGroupMatches: () => void;
  onGenerateBracket: () => void;
  onAdvanceWinners: () => void;
  onEditMatch: (m: TournamentMatch) => void;
  onCancelMatch: (matchId: string) => void;
  previewLoading: boolean;
}) {
  const isGroups = tournament.format !== 'knockout_only';
  const groupMatches = tournament.matches.filter((m) => m.phase === 'group');
  const knockoutMatches = tournament.matches.filter((m) => m.phase !== 'group');
  const teamsHaveGroups = tournament.teams.some((t) => t.groupLabel);
  const needsGroupAssignment = tournament.format === 'groups_and_knockout';
  const hasKnockout = knockoutMatches.length > 0;
  const groupStageComplete = groupMatches.length > 0 &&
    groupMatches.every((match) => match.status === 'completed');
  const pendingAdvance =
    knockoutMatches.some((m) => m.phase !== 'third_place' && m.status === 'completed') &&
    knockoutMatches.some((m) => m.phase !== 'third_place' && (!m.teamAId || !m.teamBId));

  return (
    <div>
      {/* ── Group phase ─────────────────────────────────── */}
      {isGroups && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ color: '#e8eaf6', margin: 0, fontSize: 16, fontWeight: 700 }}>
              Fase de grupos
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {hasKnockout ? (
                <span style={{ fontSize: 12, color: '#4a5580', fontStyle: 'italic' }}>
                  Bracket generado — fase de grupos bloqueada
                </span>
              ) : (
                <>
                  {needsGroupAssignment && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={onGenerateGroups}
                    >
                      {teamsHaveGroups ? 'Reasignar grupos' : 'Asignar grupos'}
                    </button>
                  )}
                  {(!needsGroupAssignment || teamsHaveGroups) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={onGenerateGroupMatches}
                    >
                      {groupMatches.length > 0 ? 'Regenerar partidos de grupo' : 'Generar partidos de grupo'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {groupMatches.length === 0 && (
            <div className="card" style={{ color: '#7c8db5', textAlign: 'center', padding: 24 }}>
              {teamsHaveGroups
                ? 'Haz clic en "Generar partidos de grupo" para crear los cruces.'
                : needsGroupAssignment
                  ? 'Primero asigna los equipos a sus grupos.'
                  : 'Genera los partidos de liga para iniciar la clasificación.'}
            </div>
          )}
          {groupMatches.length > 0 && (
            <GroupMatchList
              matches={groupMatches}
              teams={tournament.teams}
              onEdit={onEditMatch}
            />
          )}
        </div>
      )}

      {/* ── Knockout bracket ─────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ color: '#e8eaf6', margin: 0, fontSize: 16, fontWeight: 700 }}>
            {isGroups ? 'Fase eliminatoria' : 'Bracket eliminatorio'}
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pendingAdvance && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onAdvanceWinners}
              >
                Avanzar ganadores
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onGenerateBracket}
              disabled={previewLoading || (isGroups && !groupStageComplete)}
              title={isGroups && !groupStageComplete ? 'Completa todos los partidos de grupo para ver los cruces.' : undefined}
            >
              {previewLoading ? 'Cargando vista previa…' : hasKnockout ? 'Previsualizar nuevo bracket' : 'Previsualizar bracket'}
            </button>
          </div>
        </div>

        {!hasKnockout && (
          <div className="card" style={{ color: '#7c8db5', textAlign: 'center', padding: 24 }}>
            {isGroups
              ? 'Genera primero los partidos de grupo y registra los marcadores. Luego genera el bracket eliminatorio.'
              : 'Haz clic en "Generar bracket" para crear los cruces.'}
          </div>
        )}

        {hasKnockout && (
          <KnockoutBracket
            matches={knockoutMatches}
            teams={tournament.teams}
            onEdit={onEditMatch}
            onCancel={onCancelMatch}
          />
        )}
      </div>
    </div>
  );
}

function GroupMatchList({
  matches,
  onEdit,
}: {
  matches: TournamentMatch[];
  teams?: TournamentTeam[];
  onEdit: (m: TournamentMatch) => void;
}) {
  const byGroup = new Map<string, TournamentMatch[]>();
  for (const m of matches) {
    const g = m.groupLabel ?? 'Sin grupo';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(m);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from(byGroup.entries()).map(([group, gMatches]) => (
        <div key={group}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#6e8efb',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Grupo {group}
          </div>
          {gMatches.map((m) => (
            <MatchCard key={m.id} match={m} onEdit={() => onEdit(m)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function KnockoutBracket({
  matches,
  onEdit,
  onCancel,
}: {
  matches: TournamentMatch[];
  teams?: TournamentTeam[];
  onEdit: (m: TournamentMatch) => void;
  onCancel: (matchId: string) => void;
}) {
  // Separate third-place from main bracket
  const thirdPlace = matches.find((m) => m.phase === 'third_place');
  const mainMatches = matches.filter((m) => m.phase !== 'third_place');

  // Group by round
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of mainMatches) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, []);
    byRound.get(m.roundNumber)!.push(m);
  }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  const phaseLabel: Record<string, string> = {
    round_1: 'Ronda 1',
    round_2: 'Ronda 2',
    round_3: 'Ronda 3',
    quarterfinal: 'Cuartos de final',
    semifinal: 'Semifinal',
    final: 'Final',
    third_place: 'Tercer puesto',
  };

  return (
    <div>
      {/* Main bracket — scrollable horizontal grid */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 8,
          alignItems: 'flex-start',
        }}
      >
        {rounds.map((round) => {
          const roundMatches = byRound.get(round)!;
          const label = roundMatches[0]
            ? phaseLabel[roundMatches[0].phase] ?? `Ronda ${round}`
            : `Ronda ${round}`;
          return (
            <div key={round} style={{ minWidth: 200, flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6e8efb',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                  textAlign: 'center',
                }}
              >
                {label}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  justifyContent: 'space-around',
                  height: '100%',
                }}
              >
                {roundMatches.map((m) => (
                  <BracketMatchCard key={m.id} match={m} onEdit={() => onEdit(m)} onCancel={() => onCancel(m.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Third place */}
      {thirdPlace && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#ffd54f',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Tercer puesto
          </div>
          <div style={{ maxWidth: 260 }}>
            <BracketMatchCard
              match={thirdPlace}
              onEdit={() => onEdit(thirdPlace)}
              onCancel={() => onCancel(thirdPlace.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BracketMatchCard({
  match,
  onEdit,
  onCancel,
}: {
  match: TournamentMatch;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const teamAName = match.teamA?.name ?? 'TBD';
  const teamBName = match.teamB?.name ?? 'TBD';
  const setsA = match.sets.filter((s) => s.scoreA > s.scoreB).length;
  const setsB = match.sets.filter((s) => s.scoreB > s.scoreA).length;
  const isTbd = !match.teamAId && !match.teamBId;
  const isCancelled = match.status === 'cancelled';

  return (
    <div
      className="card"
      style={{
        padding: '10px 12px',
        fontSize: 13,
        opacity: isTbd ? 0.55 : 1,
      }}
    >
      {isCancelled ? (
        <div style={{ color: '#7c8db5', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
          No se jugó
        </div>
      ) : (
        <>
          <div
            style={{ cursor: isTbd ? 'default' : 'pointer' }}
            onClick={isTbd ? undefined : onEdit}
          >
            <BracketTeamRow
              name={teamAName}
              isWinner={!!match.winnerId && match.winnerId === match.teamAId}
              sets={match.status === 'completed' ? setsA : null}
              tbd={!match.teamAId}
            />
            <div style={{ height: 1, background: '#2a2f5a', margin: '4px 0' }} />
            <BracketTeamRow
              name={teamBName}
              isWinner={!!match.winnerId && match.winnerId === match.teamBId}
              sets={match.status === 'completed' ? setsB : null}
              tbd={!match.teamBId}
            />
          </div>
          {!isTbd && match.status !== 'completed' && match.phase === 'third_place' && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{ fontSize: 11, color: '#7c8db5', background: 'transparent', border: '1px solid #2a2f5a', padding: '2px 8px' }}
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
              >
                No se jugó
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BracketTeamRow({
  name,
  isWinner,
  sets,
  tbd,
}: {
  name: string;
  isWinner: boolean;
  sets: number | null;
  tbd: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          color: tbd ? '#4a5580' : isWinner ? '#2ecc71' : '#e8eaf6',
          fontWeight: isWinner ? 700 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      {sets !== null && (
        <span
          style={{
            fontWeight: 700,
            color: isWinner ? '#2ecc71' : '#7c8db5',
            minWidth: 12,
            textAlign: 'right',
          }}
        >
          {sets}
        </span>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#7c8db5', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#e8eaf6', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
