import { useEffect, useRef, useState, type FormEvent } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import { usersService } from '../services/users.service';
import type { Tournament, User } from '../types';
import { getApiError } from '../services/api';

interface PlayerRow {
  key: string;
  type: 'member' | 'guest';
  userId: string;
  guestName: string;
  isCaptain: boolean;
}

function makeKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function emptyRow(type: 'member' | 'guest' = 'guest'): PlayerRow {
  return { key: makeKey(), type, userId: '', guestName: '', isCaptain: false };
}

interface Props {
  tournament: Tournament;
  onClose: () => void;
  onSaved: () => void;
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  color: '#7c8db5',
  fontSize: 13,
  marginBottom: 6,
};

// ---------------------------------------------------------------------------
// Inline searchable member picker
// ---------------------------------------------------------------------------
interface MemberPickerProps {
  members: User[];
  selectedId: string;
  disabledIds: Set<string>;
  onChange: (id: string) => void;
}

function MemberPicker({ members, selectedId, disabledIds, onChange }: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = members.find((m) => m.id === selectedId);

  const filtered = members.filter((m) => {
    if (disabledIds.has(m.id)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.includes(q);
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#0f1020',
          border: '1px solid #2a2f5a',
          borderRadius: 10,
          padding: '8px 12px',
          color: selected ? '#e8eaf6' : '#4a5580',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : 'Seleccionar miembro…'}
        </span>
        {selected ? (
          <span
            onClick={handleClear}
            style={{ color: '#e74c3c', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}
          >
            ×
          </span>
        ) : (
          <span style={{ color: '#4a5580', fontSize: 12 }}>▾</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#0f1020',
            border: '1px solid #2a2f5a',
            borderRadius: 10,
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #2a2f5a44' }}>
            <input
              ref={inputRef}
              className="zetas-input"
              placeholder="Buscar por nombre o teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px' }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 16px', color: '#4a5580', fontSize: 13, textAlign: 'center' }}>
                {search ? 'Sin resultados' : 'No hay miembros disponibles'}
              </div>
            ) : (
              filtered.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: i < filtered.length - 1 ? '1px solid #2a2f5a33' : 'none',
                    padding: '10px 14px',
                    color: '#e8eaf6',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.background = '#3b5bdb18'; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#3b5bdb33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#6e8efb', fontWeight: 700, fontSize: 13, flexShrink: 0,
                  }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    <div style={{ color: '#7c8db5', fontSize: 11 }}>{m.phone}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function TeamRegistrationModal({ tournament, onClose, onSaved }: Props) {
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    usersService.list().then((r) => setMembers(r.data)).catch(() => {});
  }, []);

  // UserIds already in other teams of this tournament
  const alreadyInTournament = new Set(
    tournament.teams.flatMap((t) =>
      t.players.filter((p) => p.userId).map((p) => p.userId!),
    ),
  );

  const addPlayer = (type: 'member' | 'guest') =>
    setPlayers((prev) => [...prev, emptyRow(type)]);

  const removePlayer = (key: string) =>
    setPlayers((prev) => prev.filter((p) => p.key !== key));

  const updatePlayer = (key: string, changes: Partial<PlayerRow>) =>
    setPlayers((prev) => prev.map((p) => (p.key === key ? { ...p, ...changes } : p)));

  const captainCount = players.filter((p) => p.isCaptain).length;

  // Per-row: the set of userIds already used in OTHER rows (to prevent duplicates in the same team)
  function takenIdsExcluding(selfKey: string) {
    const taken = new Set(alreadyInTournament);
    for (const p of players) {
      if (p.key !== selfKey && p.type === 'member' && p.userId) {
        taken.add(p.userId);
      }
    }
    return taken;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!teamName.trim()) {
      setError('Ingresa un nombre de equipo.');
      return;
    }

    const incomplete = players.find(
      (p) => (p.type === 'member' && !p.userId) || (p.type === 'guest' && !p.guestName.trim()),
    );
    if (incomplete) {
      setError('Completa los datos de todos los jugadores o elimina las filas vacías.');
      return;
    }

    // Check duplicate userIds within the same team
    const memberIds = players.filter((p) => p.type === 'member').map((p) => p.userId);
    const uniqueMemberIds = new Set(memberIds);
    if (memberIds.length !== uniqueMemberIds.size) {
      setError('Un miembro no puede aparecer más de una vez en el mismo equipo.');
      return;
    }

    setSaving(true);
    try {
      await tournamentsService.registerTeam(tournament.id, {
        name: teamName.trim(),
        players: players.map((p) => ({
          userId: p.type === 'member' ? p.userId : undefined,
          guestName: p.type === 'guest' ? p.guestName.trim() : undefined,
          isCaptain: p.isCaptain,
        })),
      });
      onSaved();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const canAddMore = players.length < tournament.maxPlayersPerTeam;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 12px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 500, padding: 28, position: 'relative' }}>
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

        <h2 style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>
          Inscribir equipo
        </h2>
        <p style={{ color: '#7c8db5', fontSize: 13, margin: '0 0 20px' }}>
          {tournament.name}
          {tournament.minPlayersPerTeam > 0 && ` · ${tournament.minPlayersPerTeam}–${tournament.maxPlayersPerTeam} jugadores`}
          {tournament.minZetasMembers > 0 && ` · Mín. ${tournament.minZetasMembers} miembros Zetas`}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Team name */}
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Nombre del equipo *</label>
            <input
              className="zetas-input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Ej: Los Zetas"
              required
            />
          </div>

          {/* Players */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...fieldLabel, marginBottom: 0 }}>
                Jugadores{players.length > 0 ? ` (${players.length})` : ''}
              </label>
              <span style={{ color: '#4a5580', fontSize: 11 }}>Opcional</span>
            </div>

            {players.length === 0 && (
              <div style={{
                background: '#1a2035',
                border: '1px dashed #2a2f5a',
                borderRadius: 10,
                padding: '14px 16px',
                color: '#4a5580',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 10,
              }}>
                Sin jugadores añadidos — puedes completarlos luego
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map((player, idx) => (
                <div
                  key={player.key}
                  style={{
                    background: '#1a2035',
                    borderRadius: 10,
                    padding: 10,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: '#7c8db5', fontSize: 12, minWidth: 20 }}>
                    {idx + 1}.
                  </span>

                  <select
                    className="zetas-input"
                    style={{ width: 100, padding: '8px 10px', fontSize: 13, flexShrink: 0 }}
                    value={player.type}
                    onChange={(e) =>
                      updatePlayer(player.key, {
                        type: e.target.value as 'member' | 'guest',
                        userId: '',
                        guestName: '',
                      })
                    }
                  >
                    <option value="member">Miembro</option>
                    <option value="guest">Externo</option>
                  </select>

                  {player.type === 'member' ? (
                    <MemberPicker
                      members={members}
                      selectedId={player.userId}
                      disabledIds={takenIdsExcluding(player.key)}
                      onChange={(id) => updatePlayer(player.key, { userId: id })}
                    />
                  ) : (
                    <input
                      className="zetas-input"
                      style={{ flex: 1, fontSize: 13 }}
                      placeholder="Nombre del externo"
                      value={player.guestName}
                      onChange={(e) => updatePlayer(player.key, { guestName: e.target.value })}
                    />
                  )}

                  {/* Captain star */}
                  <button
                    type="button"
                    title={player.isCaptain ? 'Quitar capitán' : 'Marcar como capitán'}
                    onClick={() => {
                      if (!player.isCaptain && captainCount > 0) return;
                      updatePlayer(player.key, { isCaptain: !player.isCaptain });
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: captainCount > 0 && !player.isCaptain ? 'default' : 'pointer',
                      fontSize: 18,
                      color: player.isCaptain ? '#ffd54f' : '#3a4a6b',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ★
                  </button>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removePlayer(player.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#e74c3c',
                      fontSize: 18,
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {canAddMore && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => addPlayer('member')}
                >
                  + Miembro Zetas
                </button>
                {tournament.allowExternalTeams && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => addPlayer('guest')}
                  >
                    + Externo
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <p style={{ color: '#ef5350', fontSize: 13, marginBottom: 14 }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Inscribiendo…' : 'Inscribir equipo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
