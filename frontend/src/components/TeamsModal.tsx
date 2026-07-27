import { useState } from 'react';
import { Modal } from './Modal';
import { gamesService } from '../services/games.service';
import { getApiError } from '../services/api';
import { displayName } from '../utils/display-name';
import type { Game, GameRegistration } from '../types';

interface TeamsModalProps {
  open: boolean;
  onClose: () => void;
  game: Game;
  isAdmin: boolean;
  onGameUpdate: (game: Game) => void;
}

function playerLabel(reg: GameRegistration): string {
  if (reg.isGuest) return reg.guestName || 'Invitado';
  return reg.user ? displayName(reg.user) : 'Desconocido';
}

function isSetter(reg: GameRegistration): boolean {
  return !reg.isGuest && (reg.user?.positions ?? []).includes('armador');
}

function skillBadge(reg: GameRegistration): string | null {
  if (reg.isGuest) return null;
  const raw = reg.user?.skillLevel;
  if (raw == null) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n.toFixed(1);
}

function teamSkillTotal(members: GameRegistration[]): string | null {
  let total = 0;
  for (const r of members) {
    if (r.isGuest) continue;
    const raw = r.user?.skillLevel;
    if (raw == null) return null;
    const n = Number(raw);
    if (isNaN(n)) return null;
    total += n;
  }
  return total.toFixed(1);
}

export function TeamsModal({ open, onClose, game, isAdmin, onGameUpdate }: TeamsModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');

  const assigned = game.registrations.filter((r) => !r.isWaitingList && r.teamNumber != null);
  const teamNumbers = [...new Set(assigned.map((r) => r.teamNumber as number))].sort((a, b) => a - b);

  async function handleRegenerate() {
    setBusy(true);
    setError('');
    setSendSuccess('');
    try {
      const { data } = await gamesService.generateTeams(game.id);
      onGameUpdate(data);
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendWhatsapp() {
    setBusy(true);
    setError('');
    setSendSuccess('');
    try {
      const { data } = await gamesService.sendTeamsWhatsapp(game.id);
      if (data.sent) {
        setSendSuccess('Equipos enviados al grupo de WhatsApp');
      } else {
        setError('No se pudo enviar el mensaje a WhatsApp. Intenta de nuevo.');
      }
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Equipos" width={640}>
      {teamNumbers.length === 0 ? (
        <p style={{ color: '#7c8db5', fontSize: 14, textAlign: 'center', padding: 20 }}>
          Aún no se han generado los equipos.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
            gap: 12,
            marginBottom: 16,
          }}
        >
          {teamNumbers.map((n) => {
            const members = assigned.filter((r) => r.teamNumber === n);
            const total = isAdmin ? teamSkillTotal(members) : null;
            return (
              <div
                key={n}
                style={{
                  background: '#161829',
                  border: '1px solid #2a2f5a',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ color: '#6e8efb', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  Equipo {n}
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {members.map((r) => {
                    const skill = isAdmin ? skillBadge(r) : null;
                    return (
                      <li key={r.id} style={{ color: '#e8eaf6', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ flex: 1 }}>{playerLabel(r)}</span>
                        {r.isGuest && <span title="Invitado">👤</span>}
                        {isSetter(r) && (
                          <span title="Armador" style={{ color: '#e3a008', fontSize: 11, fontWeight: 600 }}>
                            🎯
                          </span>
                        )}
                        {skill != null && (
                          <span
                            title={`Habilidad: ${skill}`}
                            style={{
                              background: '#2a2f5a',
                              color: '#6e8efb',
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 6,
                              padding: '1px 5px',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {skill}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {total != null && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px solid #2a2f5a',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#7c8db5', fontSize: 11 }}>Total skill</span>
                    <span
                      style={{
                        background: '#1a1f3a',
                        color: '#a8b4ff',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: '2px 8px',
                        border: '1px solid #2a2f5a',
                      }}
                    >
                      {total}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {teamNumbers.length > 0 && (
        <p style={{ color: '#7c8db5', fontSize: 11, margin: '0 0 12px' }}>🎯 = armador</p>
      )}

      {error && <p style={{ color: '#ff6b6b', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
      {sendSuccess && <p style={{ color: '#2da44e', fontSize: 13, margin: '0 0 10px' }}>{sendSuccess}</p>}

      {isAdmin && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={handleRegenerate} disabled={busy}>
            {busy ? '...' : teamNumbers.length > 0 ? '🔄 Regenerar' : 'Generar equipos'}
          </button>
          {teamNumbers.length > 0 && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSendWhatsapp} disabled={busy}>
              {busy ? '...' : '📤 Enviar a WhatsApp'}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
