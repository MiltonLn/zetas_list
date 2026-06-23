import { useState } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import type { Tournament, TournamentTeam } from '../types';
import { getApiError } from '../services/api';

interface Props {
  tournament: Tournament;
  onClose: () => void;
  onSaved: (updated: Tournament) => void;
}

const GROUPS = 'ABCDEFGH'.split('');

export function GroupAssignModal({ tournament, onClose, onSaved }: Props) {
  const numGroups = tournament.numberOfGroups ?? 2;
  const availableGroups = GROUPS.slice(0, numGroups);

  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const team of tournament.teams) {
      initial[team.id] = team.groupLabel ?? availableGroups[0];
    }
    return initial;
  });
  const [autoAssign, setAutoAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await tournamentsService.assignGroups(
        tournament.id,
        autoAssign ? undefined : assignments,
      );
      onSaved(res.data);
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
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h3 style={{ color: '#e8eaf6', margin: '0 0 16px', fontSize: 16 }}>
          Asignar grupos
        </h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#c5cae9', fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoAssign}
            onChange={(e) => setAutoAssign(e.target.checked)}
          />
          Asignación automática (round-robin)
        </label>

        {!autoAssign && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {tournament.teams.map((team: TournamentTeam) => (
              <div
                key={team.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <span style={{ color: '#e8eaf6', fontSize: 14, flex: 1 }}>{team.name}</span>
                <select
                  className="zetas-input"
                  style={{ minWidth: 110 }}
                  value={assignments[team.id] ?? availableGroups[0]}
                  onChange={(e) =>
                    setAssignments((prev) => ({ ...prev, [team.id]: e.target.value }))
                  }
                >
                  {availableGroups.map((g) => (
                    <option key={g} value={g}>
                      Grupo {g}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ color: '#ef5350', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Guardando…' : 'Guardar asignaciones'}
          </button>
        </div>
      </div>
    </div>
  );
}
