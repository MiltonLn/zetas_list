import { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { gamesService } from '../services/games.service';
import { showToast } from '../utils/toast';
import { getApiError } from '../services/api';

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  username: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  availableMembers: AvailableMember[];
  isUserRegistered: boolean;
  isAdmin: boolean;
  proxyLimitReached: boolean;
  maxProxyRegistrations: number;
  onSuccess: () => void;
}

export function RegisterOtherModal({ open, onClose, gameId, availableMembers, isUserRegistered, isAdmin, proxyLimitReached, maxProxyRegistrations, onSuccess }: Props) {
  const [tab, setTab] = useState<'member' | 'guest'>('member');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setGuestName('');
      setError('');
      setLoading('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, tab]);

  const filtered = availableMembers.filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      m.phone.includes(q)
    );
  });

  async function handleSelectMember(memberId: string) {
    setLoading(memberId);
    setError('');
    try {
      await gamesService.registerProxy(gameId, memberId);
      const member = availableMembers.find((m) => m.id === memberId);
      showToast(`${member?.name || 'Jugador'} fue anotado correctamente`);
      setSearch('');
      onSuccess();
      onClose();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setLoading('');
    }
  }

  async function handleInviteGuest() {
    if (!guestName.trim()) return;
    setLoading('guest');
    setError('');
    try {
      await gamesService.registerGuest(gameId, guestName.trim());
      showToast(`Invitado "${guestName.trim()}" fue anotado correctamente`);
      setGuestName('');
      onSuccess();
      onClose();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setLoading('');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Anotar a otra persona" width={520}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid #2a2f5a' }}>
        <button
          onClick={() => setTab('member')}
          style={{
            flex: 1, padding: '12px 0', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            background: tab === 'member' ? '#3b5bdb' : '#1a1d38',
            color: tab === 'member' ? '#fff' : '#7c8db5',
            transition: 'all 0.15s',
          }}
        >
          Miembro del grupo
        </button>
        <button
          onClick={() => setTab('guest')}
          style={{
            flex: 1, padding: '12px 0', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            background: tab === 'guest' ? '#3b5bdb' : '#1a1d38',
            color: tab === 'guest' ? '#fff' : '#7c8db5',
            transition: 'all 0.15s',
          }}
        >
          Invitado externo
        </button>
      </div>

      {error && (
        <div style={{ background: '#e031311a', border: '1px solid #e0313155', borderRadius: 8, padding: '10px 14px', color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {tab === 'member' && (
        <div>
          {!isAdmin && !isUserRegistered ? (
            <div style={{
              background: '#e3a00811', border: '1px solid #e3a00833',
              borderRadius: 10, padding: '20px 16px', textAlign: 'center',
            }}>
              <p style={{ color: '#e3a008', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Debes estar anotado en la lista antes de poder anotar a otra persona.
              </p>
            </div>
          ) : proxyLimitReached ? (
            <div style={{
              background: '#e3a00811', border: '1px solid #e3a00833',
              borderRadius: 10, padding: '20px 16px', textAlign: 'center',
            }}>
              <p style={{ color: '#e3a008', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Ya anotaste el máximo de {maxProxyRegistrations} persona(s) permitida(s) en este partido.
              </p>
            </div>
          ) : (
            <>
              <input
            ref={inputRef}
            className="zetas-input"
            type="text"
            placeholder="Buscar por nombre, usuario o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <div style={{
            border: '1px solid #2a2f5a', borderRadius: 10,
            maxHeight: 340, overflowY: 'auto',
            background: '#0f1020',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#7c8db5', fontSize: 14 }}>
                {search.trim() ? 'No se encontraron miembros' : 'No hay miembros disponibles'}
              </div>
            ) : (
              filtered.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMember(m.id)}
                  disabled={!!loading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', textAlign: 'left',
                    background: loading === m.id ? '#3b5bdb15' : 'transparent',
                    border: 'none',
                    borderBottom: i < filtered.length - 1 ? '1px solid #2a2f5a44' : 'none',
                    padding: '12px 16px',
                    color: '#e8eaf6',
                    cursor: loading ? 'wait' : 'pointer',
                    fontSize: 14,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget).style.background = '#3b5bdb18'; }}
                  onMouseLeave={(e) => { if (loading !== m.id) (e.currentTarget).style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: '#3b5bdb33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#6e8efb', fontWeight: 700, fontSize: 15, flexShrink: 0,
                  }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                    <div style={{ color: '#7c8db5', fontSize: 12, marginTop: 1 }}>
                      @{m.username} · {m.phone}
                    </div>
                  </div>
                  {loading === m.id && (
                    <span style={{ color: '#6e8efb', fontSize: 12 }}>Anotando...</span>
                  )}
                </button>
              ))
            )}
          </div>

          <p style={{ color: '#7c8db5', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            Toca un miembro para anotarlo en la lista
          </p>
            </>
          )}
        </div>
      )}

      {tab === 'guest' && (
        <div>
          {!isUserRegistered ? (
            <div style={{
              background: '#e3a00811', border: '1px solid #e3a00833',
              borderRadius: 10, padding: '20px 16px', textAlign: 'center',
            }}>
              <p style={{ color: '#e3a008', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Debes estar anotado en la lista antes de poder invitar a alguien externo.
              </p>
            </div>
          ) : (
            <>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 8 }}>
                Nombre del invitado
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={tab === 'guest' ? inputRef : undefined}
                  className="zetas-input"
                  type="text"
                  placeholder="Ej: Carlos Pérez"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInviteGuest(); } }}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={handleInviteGuest}
                  disabled={!!loading || !guestName.trim()}
                  style={{
                    background: '#3b5bdb', border: 'none', borderRadius: 10,
                    padding: '10px 20px', color: '#fff', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
                    opacity: loading || !guestName.trim() ? 0.5 : 1,
                  }}
                >
                  {loading === 'guest' ? 'Anotando...' : 'Invitar'}
                </button>
              </div>
              <p style={{ color: '#7c8db5', fontSize: 12, marginTop: 10 }}>
                Los invitados antes de la hora de corte siempre van a la lista de espera.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
