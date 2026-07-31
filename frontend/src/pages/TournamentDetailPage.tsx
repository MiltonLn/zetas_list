import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resolvePhotoUrl } from '../components/Avatar';
import type { Tournament, TournamentTeam, TournamentMatch } from '../types';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  TOURNAMENT_FORMAT_LABELS,
} from '../types';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { TeamRegistrationModal } from '../components/TeamRegistrationModal';
import { useTournamentDetail } from '../hooks/useTournamentDetail';

const money = (n: number) =>
  n === 0 ? 'Gratis' : `$${n.toLocaleString('es-CO')}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Shared view component ─────────────────────────────────────────────────────

export function TournamentView({
  tournament,
  isAdmin,
  onRefresh,
}: {
  tournament: Tournament;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [showRegModal, setShowRegModal] = useState(false);
  const [teamsExpanded, setTeamsExpanded] = useState(true);
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  const canRegister = tournament.status === 'registration_open';
  const slots = tournament.maxTeams - tournament.teams.length;
  const isFull = slots <= 0;
  const statusColor = TOURNAMENT_STATUS_COLORS[tournament.status];

  return (
    <>
      <div className="page-wrapper" style={{ maxWidth: 860, paddingBottom: 48 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap' }}>

          {/* Flyer */}
          {tournament.flyerUrl && (
            <div
              onClick={() => setLightboxSrc(resolvePhotoUrl(tournament.flyerUrl!))}
              title="Ver flyer completo"
              style={{
                flexShrink: 0, width: 130, borderRadius: 12,
                overflow: 'hidden', cursor: 'zoom-in',
                border: '1px solid #2a2f5a',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
            >
              <img
                src={resolvePhotoUrl(tournament.flyerUrl!)}
                alt="Flyer"
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          )}

          {/* Title + meta */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                color: statusColor, background: `${statusColor}22`,
                border: `1px solid ${statusColor}55`,
              }}>
                {TOURNAMENT_STATUS_LABELS[tournament.status]}
              </span>
              {isAdmin && (
                <Link to={`/admin/torneos/${tournament.id}`} className="btn btn-sm btn-secondary">
                  Panel admin
                </Link>
              )}
            </div>

            <h1 style={{ color: '#e8eaf6', fontSize: 24, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.2 }}>
              {tournament.name}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
              <MetaChip icon="📅" label={`${formatDate(tournament.startDate)} — ${formatDate(tournament.endDate)}`} />
              <MetaChip icon="🏐" label={TOURNAMENT_FORMAT_LABELS[tournament.format]} />
              <MetaChip icon="💰" label={money(tournament.pricePerTeam)} />
              <MetaChip
                icon="🏆"
                label={`${tournament.teams.length} / ${tournament.maxTeams} equipos`}
                color={isFull ? '#ef5350' : undefined}
              />
              <MetaChip icon="👥" label={`${tournament.minPlayersPerTeam}–${tournament.maxPlayersPerTeam} jugadores/equipo`} />
              {tournament.prizeDescription && (
                <MetaChip icon="🥇" label={tournament.prizeDescription} />
              )}
            </div>

            {/* Rules inline */}
            {tournament.rules && (
              <p style={{ color: '#a7b0d0', fontSize: 13, whiteSpace: 'pre-wrap', margin: '12px 0 0', lineHeight: 1.6 }}>
                {tournament.rules}
              </p>
            )}
            {tournament.rulesFileUrl && (
              <button
                type="button"
                onClick={() => setPdfSrc(resolvePhotoUrl(tournament.rulesFileUrl!))}
                style={{
                  marginTop: 12,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', padding: 0,
                  color: '#6e8efb', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                <span style={{ fontSize: 14 }}>📄</span>
                Ver reglamento completo (PDF)
              </button>
            )}
          </div>
        </div>

        {/* ── Register CTA ─────────────────────────────────────────────── */}
        {canRegister && !isFull && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 24, padding: '14px 20px', fontSize: 15, fontWeight: 700 }}
            onClick={() => setShowRegModal(true)}
          >
            + Inscribir mi equipo
          </button>
        )}
        {canRegister && isFull && (
          <div style={{
            textAlign: 'center', padding: '12px 20px', marginBottom: 24,
            background: '#ef535011', border: '1px solid #ef535033', borderRadius: 12,
            color: '#ef5350', fontWeight: 600, fontSize: 14,
          }}>
            Torneo lleno — no quedan cupos disponibles
          </div>
        )}

        {/* ── Teams ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setTeamsExpanded((v) => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: '10px 14px',
            cursor: 'pointer', textAlign: 'left', marginBottom: teamsExpanded ? 8 : 20,
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.background = '#ffffff08'; }}
          onMouseLeave={(e) => { (e.currentTarget).style.background = 'none'; }}
        >
          <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, margin: 0 }}>Equipos</h2>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#6e8efb',
            background: '#6e8efb22', padding: '1px 8px', borderRadius: 20,
          }}>{tournament.teams.length}</span>
          <span style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            background: '#2a2f5a', color: '#a7b0d0', fontSize: 13,
            transition: 'transform 0.2s',
            transform: teamsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>▾</span>
        </button>
        {teamsExpanded && (
          tournament.teams.length === 0 ? (
            <EmptyState>Aún no hay equipos inscritos.</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
              {tournament.teams.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          )
        )}

        {/* ── Results ──────────────────────────────────────────────────── */}
        {tournament.matches.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setResultsExpanded((v) => !v)}
              style={{
                width: '100%', background: 'none', border: 'none', padding: '10px 14px',
                cursor: 'pointer', textAlign: 'left', marginBottom: resultsExpanded ? 8 : 20,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget).style.background = '#ffffff08'; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = 'none'; }}
            >
              <h2 style={{ color: '#e8eaf6', fontSize: 16, fontWeight: 700, margin: 0 }}>Resultados</h2>
              <span style={{
                fontSize: 12, fontWeight: 600, color: '#6e8efb',
                background: '#6e8efb22', padding: '1px 8px', borderRadius: 20,
              }}>{tournament.matches.length}</span>
              <span style={{
                marginLeft: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 6,
                background: '#2a2f5a', color: '#a7b0d0', fontSize: 13,
                transition: 'transform 0.2s',
                transform: resultsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>▾</span>
            </button>
            {resultsExpanded && <PublicResults tournament={tournament} />}
          </>
        )}
      </div>

      {/* Modals */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {pdfSrc && <PdfModal src={pdfSrc} onClose={() => setPdfSrc(null)} />}
      {showRegModal && (
        <TeamRegistrationModal
          tournament={tournament}
          onClose={() => setShowRegModal(false)}
          onSaved={() => { setShowRegModal(false); onRefresh(); }}
        />
      )}
    </>
  );
}

// ── Main page (authenticated, with sidebar) ───────────────────────────────────

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const { tournament, loading, error, refresh } = useTournamentDetail(id);

  if (loading) {
    return (
      <>
        <PageHeader title="Torneo" backTo="/torneos" />
        <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <Spinner />
        </div>
      </>
    );
  }

  if (error || !tournament) {
    return (
      <>
        <PageHeader title="Torneo" backTo="/torneos" />
        <div className="page-wrapper">
          <div className="card" style={{ color: '#ef5350', textAlign: 'center' }}>
            {error || 'Torneo no encontrado'}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={tournament.name} backTo="/torneos" />
      <TournamentView tournament={tournament} isAdmin={isAdmin} onRefresh={refresh} />
    </>
  );
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt="Flyer del torneo"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', cursor: 'default' }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 16, right: 20,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#fff', fontSize: 28, cursor: 'pointer',
          borderRadius: '50%', width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── PDF Modal ─────────────────────────────────────────────────────────────────

export function PdfModal({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860, height: '85vh', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              fontSize: 24, cursor: 'pointer', borderRadius: '50%',
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        <iframe
          src={src}
          style={{ flex: 1, border: 'none', borderRadius: 12, background: '#fff' }}
          title="Reglamento del torneo"
        />
      </div>
    </div>
  );
}

// ── Results section ───────────────────────────────────────────────────────────

function PublicResults({ tournament }: { tournament: Tournament }) {
  const groupMatches = tournament.matches.filter((m) => m.phase === 'group');
  const knockoutMatches = tournament.matches.filter((m) => m.phase !== 'group');
  const thirdPlace = knockoutMatches.find((m) => m.phase === 'third_place');
  const mainKnockout = knockoutMatches.filter((m) => m.phase !== 'third_place');

  const finalMatch = knockoutMatches.find((m) => m.phase === 'final' && m.status === 'completed');
  const champion = finalMatch?.winnerId
    ? (finalMatch.winnerId === finalMatch.teamAId ? finalMatch.teamA : finalMatch.teamB)
    : null;

  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of mainKnockout) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, []);
    byRound.get(m.roundNumber)!.push(m);
  }
  const rounds = Array.from(byRound.entries()).sort(([a], [b]) => a - b);

  const phaseLabel: Record<string, string> = {
    quarterfinal: 'Cuartos',
    semifinal: 'Semis',
    final: 'Final',
    third_place: 'Tercer puesto',
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Group phase */}
      {groupMatches.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6e8efb', marginBottom: 10 }}>
            Fase de grupos
          </div>
          {Array.from(
            groupMatches.reduce((map, m) => {
              const g = m.groupLabel ?? '';
              if (!map.has(g)) map.set(g, []);
              map.get(g)!.push(m);
              return map;
            }, new Map<string, TournamentMatch[]>()),
          ).sort(([a], [b]) => a.localeCompare(b)).map(([group, matches]) => (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c8db5', marginBottom: 6, paddingLeft: 2 }}>
                GRUPO {group}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {matches.map((m) => <GroupMatchRow key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Knockout bracket */}
      {rounds.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6e8efb', marginBottom: 12 }}>
            Fase eliminatoria
          </div>
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 0, minWidth: rounds.length * 180 }}>
              {rounds.map(([round, rMatches], colIdx) => {
                const label = rMatches[0]
                  ? (phaseLabel[rMatches[0].phase] ?? `Ronda ${round}`)
                  : `Ronda ${round}`;
                const isLast = colIdx === rounds.length - 1;
                return (
                  <div
                    key={round}
                    style={{
                      flex: 1, minWidth: 160,
                      display: 'flex', flexDirection: 'column',
                      borderRight: isLast ? 'none' : '1px solid #2a2f5a33',
                      padding: '0 12px',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7c8db5', textAlign: 'center', marginBottom: 10 }}>
                      {label}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 8 }}>
                      {rMatches.map((m) => <KnockoutCard key={m.id} match={m} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {thirdPlace && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ffd54f', marginBottom: 8 }}>
                Tercer puesto
              </div>
              <div style={{ maxWidth: 200 }}>
                <KnockoutCard match={thirdPlace} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Champion banner ────────────────────────────────────────────── */}
      {champion && (
        <div style={{
          marginTop: 32,
          padding: '28px 24px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, #1a1f40 0%, #2a1f4a 100%)',
          border: '1px solid #ffd54f44',
          boxShadow: '0 0 40px rgba(255,213,79,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 8, lineHeight: 1 }}>🏆</div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.18em', color: '#ffd54f', marginBottom: 10,
          }}>
            Campeón del torneo
          </div>
          <div style={{
            fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em',
            background: 'linear-gradient(90deg, #ffd54f, #ffb300)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 6,
          }}>
            {champion.name}
          </div>
          <div style={{ fontSize: 22, marginTop: 8, letterSpacing: 4 }}>🥇🎉🎊</div>
        </div>
      )}
    </div>
  );
}

function GroupMatchRow({ match }: { match: TournamentMatch }) {
  const setsA = match.sets.filter((s) => s.scoreA > s.scoreB).length;
  const setsB = match.sets.filter((s) => s.scoreB > s.scoreA).length;
  const done = match.status === 'completed';
  const cancelled = match.status === 'cancelled';

  return (
    <div className="rounded-xl border border-[#2a2f5a] bg-[#161829]" style={{ padding: '10px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          flex: 1, fontSize: 14, fontWeight: done && match.winnerId === match.teamAId ? 700 : 500,
          color: done && match.winnerId === match.teamAId ? '#4ade80' : '#e8eaf6',
        }}>
          {match.teamA?.name ?? 'TBD'}
        </span>
        <span style={{
          fontSize: 15, fontWeight: 800, minWidth: 54, textAlign: 'center',
          color: cancelled ? '#7c8db5' : done ? '#6e8efb' : '#4a5580',
        }}>
          {cancelled ? '— —' : done ? `${setsA} – ${setsB}` : 'vs'}
        </span>
        <span style={{
          flex: 1, textAlign: 'right', fontSize: 14, fontWeight: done && match.winnerId === match.teamBId ? 700 : 500,
          color: done && match.winnerId === match.teamBId ? '#4ade80' : '#e8eaf6',
        }}>
          {match.teamB?.name ?? 'TBD'}
        </span>
      </div>
      {match.sets.length > 0 && (
        <div style={{ fontSize: 11, color: '#4a5580', marginTop: 4, textAlign: 'center' }}>
          {match.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function KnockoutCard({ match }: { match: TournamentMatch }) {
  const setsA = match.sets.filter((s) => s.scoreA > s.scoreB).length;
  const setsB = match.sets.filter((s) => s.scoreB > s.scoreA).length;
  const isTbd = !match.teamAId && !match.teamBId;
  const done = match.status === 'completed';
  const cancelled = match.status === 'cancelled';

  return (
    <div className="rounded-xl border border-[#2a2f5a] bg-[#161829]" style={{ opacity: isTbd ? 0.45 : 1, fontSize: 13 }}>
      {cancelled ? (
        <div style={{ padding: '10px 12px', color: '#4a5580', fontStyle: 'italic', textAlign: 'center' }}>No se jugó</div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px',
            background: done && match.winnerId === match.teamAId ? 'rgba(74,222,128,0.06)' : 'transparent',
            borderRadius: '10px 10px 0 0',
          }}>
            <span style={{ fontWeight: done && match.winnerId === match.teamAId ? 700 : 500, color: done && match.winnerId === match.teamAId ? '#4ade80' : '#e8eaf6' }}>
              {match.teamA?.name ?? 'TBD'}
            </span>
            {done && <span style={{ fontWeight: 800, color: '#6e8efb', fontSize: 14 }}>{setsA}</span>}
          </div>
          <div style={{ height: 1, background: '#2a2f5a' }} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px',
            background: done && match.winnerId === match.teamBId ? 'rgba(74,222,128,0.06)' : 'transparent',
            borderRadius: '0 0 10px 10px',
          }}>
            <span style={{ fontWeight: done && match.winnerId === match.teamBId ? 700 : 500, color: done && match.winnerId === match.teamBId ? '#4ade80' : '#e8eaf6' }}>
              {match.teamB?.name ?? 'TBD'}
            </span>
            {done && <span style={{ fontWeight: 800, color: '#6e8efb', fontSize: 14 }}>{setsB}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function TeamCard({ team }: { team: TournamentTeam }) {
  const [expanded, setExpanded] = useState(false);
  const captain = team.players.find((p) => p.isCaptain);

  return (
    <div className="rounded-xl border border-[#2a2f5a] bg-[#161829]" style={{ overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '12px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: '#3b5bdb22', border: '1px solid #3b5bdb44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6e8efb', fontWeight: 800, fontSize: 16,
        }}>
          {team.name.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 14 }}>{team.name}</span>
            {team.groupLabel && (
              <span style={{ fontSize: 11, color: '#6e8efb', background: '#6e8efb22', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>
                Grupo {team.groupLabel}
              </span>
            )}
          </div>
          {captain && (
            <div style={{ fontSize: 12, color: '#7c8db5', marginTop: 2 }}>
              Cap. {captain.user?.name ?? captain.guestName}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#4a5580' }}>{team.players.length} jugadores</span>
          <span style={{ color: '#4a5580', fontSize: 12, transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
        </div>
      </button>

      {expanded && team.players.length > 0 && (
        <div style={{ borderTop: '1px solid #2a2f5a22', padding: '4px 16px 12px' }}>
          {team.players.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0',
                borderBottom: i < team.players.length - 1 ? '1px solid #2a2f5a22' : 'none',
                fontSize: 13,
              }}
            >
              {p.isCaptain
                ? <span style={{ color: '#ffd54f', fontSize: 14 }}>★</span>
                : <span style={{ color: '#2a2f5a', fontSize: 14 }}>○</span>
              }
              <span style={{ color: '#c5cae9', flex: 1 }}>
                {p.user?.name ?? p.guestName ?? '—'}
              </span>
              {!p.userId && (
                <span style={{ fontSize: 11, color: '#4a5580', background: '#2a2f5a33', padding: '1px 6px', borderRadius: 6 }}>
                  externo
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaChip({ icon, label, color }: { icon: string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: color ?? '#a7b0d0' }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border border-[#2a2f5a]"
      style={{ padding: '24px 16px', textAlign: 'center', color: '#4a5580', fontSize: 14, marginBottom: 28 }}
    >
      {children}
    </div>
  );
}
