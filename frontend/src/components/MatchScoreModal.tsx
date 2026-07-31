import { useState, type FormEvent } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import type { CompetitionRulesV1, Tournament, TournamentMatch, TournamentSet } from '../types';
import { getApiError } from '../services/api';
import { DEFAULT_COMPETITION_RULES } from './tournaments/tournamentRules';

interface Props {
  match: TournamentMatch;
  tournament?: Pick<Tournament, 'competitionRules'>;
  rules?: CompetitionRulesV1;
  phase?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface SetRow {
  setNumber: number;
  scoreA: string;
  scoreB: string;
}

function initSets(existing: TournamentSet[]): SetRow[] {
  const rows = existing.map((s) => ({
      setNumber: s.setNumber,
      scoreA: String(s.scoreA),
      scoreB: String(s.scoreB),
    }));
  while (rows.length < 3) {
    rows.push({ setNumber: rows.length + 1, scoreA: '', scoreB: '' });
  }
  return rows.slice(0, 3);
}

function parsedScore(value: string): number | null {
  if (value.trim() === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

export function MatchScoreModal({ match, tournament, rules, phase, onClose, onSaved }: Props) {
  const [sets, setSets] = useState<SetRow[]>(initSets(match.sets));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const teamAName = match.teamA?.name ?? 'Equipo A';
  const teamBName = match.teamB?.name ?? 'Equipo B';
  const competitionRules = rules ?? tournament?.competitionRules ?? DEFAULT_COMPETITION_RULES;
  const matchPhase = phase ?? match.phase;
  const isGroupPhase = matchPhase === 'group';
  const isTwoSetGroup =
    isGroupPhase &&
    competitionRules.groupStage.matchFormat === 'two_sets_point_difference';
  const regularSetPoints = isGroupPhase
    ? competitionRules.groupStage.regularSetPoints
    : competitionRules.knockoutStage.regularSetPoints;
  const tiebreakSetPoints = isGroupPhase
    ? competitionRules.groupStage.tiebreakSetPoints
    : competitionRules.knockoutStage.tiebreakSetPoints;
  const winByTwo = isGroupPhase
    ? competitionRules.groupStage.winByTwo
    : competitionRules.knockoutStage.winByTwo;

  const updateSet = (idx: number, field: 'scoreA' | 'scoreB', value: string) =>
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const firstTwo = sets.slice(0, 2);
  const winsAAfterTwo = firstTwo.filter((s) => (parsedScore(s.scoreA) ?? -1) > (parsedScore(s.scoreB) ?? -1)).length;
  const winsBAfterTwo = firstTwo.filter((s) => (parsedScore(s.scoreB) ?? -1) > (parsedScore(s.scoreA) ?? -1)).length;
  const aggregateA = firstTwo.reduce((sum, s) => sum + (parsedScore(s.scoreA) ?? 0), 0);
  const aggregateB = firstTwo.reduce((sum, s) => sum + (parsedScore(s.scoreB) ?? 0), 0);
  const firstTwoComplete = firstTwo.every((s) => parsedScore(s.scoreA) !== null && parsedScore(s.scoreB) !== null);
  const needsThirdSet = firstTwoComplete && winsAAfterTwo === 1 && winsBAfterTwo === 1 &&
    (!isTwoSetGroup || aggregateA === aggregateB);
  const visibleSets = sets.slice(0, needsThirdSet ? 3 : 2);
  const winsA = visibleSets.filter((s) => (parsedScore(s.scoreA) ?? -1) > (parsedScore(s.scoreB) ?? -1)).length;
  const winsB = visibleSets.filter((s) => (parsedScore(s.scoreB) ?? -1) > (parsedScore(s.scoreA) ?? -1)).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const parsed = visibleSets.map((s) => ({
      setNumber: s.setNumber,
      scoreA: parsedScore(s.scoreA),
      scoreB: parsedScore(s.scoreB),
    }));

    if (parsed.some((s) => s.scoreA === null || s.scoreB === null)) {
      setError(`Completa los ${needsThirdSet ? 'tres' : 'dos'} sets requeridos.`);
      return;
    }
    if (parsed.some((s) => s.scoreA === s.scoreB)) {
      setError('Un set no puede terminar empatado.');
      return;
    }
    const invalidSetIndex = parsed.findIndex((set, index) => {
      if (set.scoreA === null || set.scoreB === null) return false;
      const target = index === 2 ? tiebreakSetPoints : regularSetPoints;
      const winnerScore = Math.max(set.scoreA, set.scoreB);
      return winByTwo
        ? winnerScore < target || Math.abs(set.scoreA - set.scoreB) < 2
        : winnerScore !== target;
    });
    if (invalidSetIndex >= 0) {
      const target =
        invalidSetIndex === 2 ? tiebreakSetPoints : regularSetPoints;
      setError(
        winByTwo
          ? `El set ${invalidSetIndex + 1} debe llegar al menos a ${target} puntos y ganarse por diferencia de dos.`
          : `El set ${invalidSetIndex + 1} debe terminar exactamente en ${target} puntos porque no hay alargue.`,
      );
      return;
    }
    if (!isTwoSetGroup && winsAAfterTwo !== 2 && winsBAfterTwo !== 2 && !needsThirdSet) {
      setError('Si el partido queda 1–1, debes registrar el tercer set.');
      return;
    }

    setSaving(true);
    try {
      await tournamentsService.updateMatchScore(
        match.id,
        parsed.map((s) => ({
          setNumber: s.setNumber,
          scoreA: s.scoreA as number,
          scoreB: s.scoreB as number,
        })),
      );
      onSaved();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28, position: 'relative' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: '#7c8db5',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2 style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>
          Marcador del partido
        </h2>
        <p style={{ color: '#7c8db5', fontSize: 12, margin: '-12px 0 16px' }}>
          {isTwoSetGroup
            ? 'Fase de grupos: se juegan 2 sets. Solo se habilita un desempate corto si quedan 1–1 y empatan en puntos acumulados.'
            : 'Mejor de 3 sets: si quedan 1–1, registra el tercer set corto.'}
        </p>

        {/* Team names and current score */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: 8,
            alignItems: 'center',
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              color: winsA > winsB ? '#2ecc71' : '#e8eaf6',
              fontWeight: winsA > winsB ? 700 : 500,
              fontSize: 14,
            }}
          >
            {teamAName}
          </div>
          <div style={{ color: '#7c8db5', fontWeight: 700, fontSize: 18 }}>
            {winsA} – {winsB}
          </div>
          <div
            style={{
              color: winsB > winsA ? '#2ecc71' : '#e8eaf6',
              fontWeight: winsB > winsA ? 700 : 500,
              fontSize: 14,
            }}
          >
            {teamBName}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {visibleSets.map((set, idx) => (
              <div
                key={set.setNumber}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto 1fr auto', gap: 8, alignItems: 'center' }}
              >
                <input
                  aria-label={`${teamAName}, set ${set.setNumber}`}
                  type="number"
                  className="zetas-input"
                  placeholder="0"
                  value={set.scoreA}
                  onChange={(e) => updateSet(idx, 'scoreA', e.target.value)}
                  min={0}
                  style={{ textAlign: 'center' }}
                />
                <span style={{ color: '#7c8db5', fontSize: 12, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  Set {set.setNumber}
                  <small style={{ display: 'block', color: '#4a5580' }}>
                    a {idx === 2 ? tiebreakSetPoints : regularSetPoints}
                    <span>{winByTwo ? ' · dif. 2' : ' · sin alargue'}</span>
                  </small>
                </span>
                <span style={{ color: '#3a4a6b' }}>–</span>
                <input
                  aria-label={`${teamBName}, set ${set.setNumber}`}
                  type="number"
                  className="zetas-input"
                  placeholder="0"
                  value={set.scoreB}
                  onChange={(e) => updateSet(idx, 'scoreB', e.target.value)}
                  min={0}
                  style={{ textAlign: 'center' }}
                />
                <span aria-hidden="true" />
              </div>
            ))}
          </div>

          {needsThirdSet && (
            <p style={{ color: '#ffd54f', fontSize: 12, margin: '0 0 14px' }}>
              {isTwoSetGroup
                ? 'Empate exacto tras 1–1: registra el set corto de desempate.'
                : 'Partido 1–1: registra el tercer set para definir al ganador.'}
            </p>
          )}

          {error && (
            <p style={{ color: '#ef5350', fontSize: 13, marginBottom: 14 }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar marcador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
