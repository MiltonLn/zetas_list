import { useState, type FormEvent } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import type { TournamentMatch, TournamentSet } from '../types';
import { getApiError } from '../services/api';

interface Props {
  match: TournamentMatch;
  onClose: () => void;
  onSaved: () => void;
}

interface SetRow {
  setNumber: number;
  scoreA: string;
  scoreB: string;
}

function initSets(existing: TournamentSet[]): SetRow[] {
  if (existing.length > 0) {
    return existing.map((s) => ({
      setNumber: s.setNumber,
      scoreA: String(s.scoreA),
      scoreB: String(s.scoreB),
    }));
  }
  return [{ setNumber: 1, scoreA: '', scoreB: '' }];
}

export function MatchScoreModal({ match, onClose, onSaved }: Props) {
  const [sets, setSets] = useState<SetRow[]>(initSets(match.sets));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const teamAName = match.teamA?.name ?? 'Equipo A';
  const teamBName = match.teamB?.name ?? 'Equipo B';

  const updateSet = (idx: number, field: 'scoreA' | 'scoreB', value: string) =>
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const addSet = () =>
    setSets((prev) => [
      ...prev,
      { setNumber: prev.length + 1, scoreA: '', scoreB: '' },
    ]);

  const removeSet = (idx: number) =>
    setSets((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 })),
    );

  const winsA = sets.filter((s) => parseInt(s.scoreA, 10) > parseInt(s.scoreB, 10)).length;
  const winsB = sets.filter((s) => parseInt(s.scoreB, 10) > parseInt(s.scoreA, 10)).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const parsed = sets.map((s) => ({
      setNumber: s.setNumber,
      scoreA: parseInt(s.scoreA, 10),
      scoreB: parseInt(s.scoreB, 10),
    }));

    if (parsed.some((s) => isNaN(s.scoreA) || isNaN(s.scoreB))) {
      setError('Todos los marcadores deben ser números válidos.');
      return;
    }

    setSaving(true);
    try {
      await tournamentsService.updateMatchScore(match.id, parsed);
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
            {sets.map((set, idx) => (
              <div
                key={set.setNumber}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto 1fr auto', gap: 8, alignItems: 'center' }}
              >
                <input
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
                </span>
                <span style={{ color: '#3a4a6b' }}>–</span>
                <input
                  type="number"
                  className="zetas-input"
                  placeholder="0"
                  value={set.scoreB}
                  onChange={(e) => updateSet(idx, 'scoreB', e.target.value)}
                  min={0}
                  style={{ textAlign: 'center' }}
                />
                <button
                  type="button"
                  onClick={() => removeSet(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#e74c3c',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginBottom: 16 }}
            onClick={addSet}
          >
            + Agregar set
          </button>

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
