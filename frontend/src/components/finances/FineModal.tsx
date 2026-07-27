import { useState } from 'react';
import { Modal } from '../Modal';
import { financesService, type Fine } from '../../services/finances.service';
import { getApiError } from '../../services/api';
import { showToast } from '../../utils/toast';
import type { User } from '../../types';

export function FineModal({ fine, users, onClose, onSaved }: {
  fine: Fine | null;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(fine?.userId || '');
  const [userSearch, setUserSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [date, setDate] = useState(fine?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(String(fine?.amount || ''));
  const [reason, setReason] = useState(fine?.reason || '');
  const [status, setStatus] = useState<'pending' | 'paid'>(fine?.status || 'pending');
  const [saving, setSaving] = useState(false);

  const selectedUser = users.find((u) => u.id === userId);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || (u.phone || '').includes(q) || u.username.toLowerCase().includes(q);
  });

  const handleSelectUser = (id: string) => {
    setUserId(id);
    setUserSearch('');
    setDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fine && !userId) {
      showToast('Selecciona una persona', 'error');
      return;
    }
    setSaving(true);
    try {
      if (fine) {
        await financesService.updateFine(fine.id, {
          userId: userId || null,
          date,
          amount: Number(amount),
          reason,
          status,
        });
      } else {
        await financesService.createFine({ userId, date, amount: Number(amount), reason, status });
      }
      showToast(fine ? 'Multa actualizada' : 'Multa creada', 'success');
      onSaved();
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={fine ? 'Editar Multa' : 'Nueva Multa'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Persona</label>
          {selectedUser ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#1a1d38', border: '1px solid #2a2f5a', borderRadius: 10,
              padding: '10px 14px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#3b5bdb33',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6e8efb', fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {selectedUser.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#e8eaf6' }}>{selectedUser.name}</div>
                <div style={{ color: '#7c8db5', fontSize: 11 }}>@{selectedUser.username}</div>
              </div>
              <button type="button" onClick={() => { setUserId(''); setDropdownOpen(true); }} style={{
                background: 'none', border: 'none', color: '#7c8db5', cursor: 'pointer', fontSize: 16,
              }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                className="zetas-input"
                type="text"
                placeholder={fine?.userName ? `Actual: ${fine.userName} (sin vincular)` : 'Buscar por nombre, usuario o teléfono...'}
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
              />
              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  border: '1px solid #2a2f5a', borderRadius: 10,
                  maxHeight: 200, overflowY: 'auto', background: '#0f1020',
                  marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#7c8db5', fontSize: 13 }}>
                      {userSearch.trim() ? 'No se encontraron miembros' : 'No hay miembros'}
                    </div>
                  ) : (
                    filteredUsers.slice(0, 20).map((u, i) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', textAlign: 'left', background: 'transparent',
                          border: 'none',
                          borderBottom: i < Math.min(filteredUsers.length, 20) - 1 ? '1px solid #2a2f5a44' : 'none',
                          padding: '10px 14px', color: '#e8eaf6', cursor: 'pointer', fontSize: 13,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#3b5bdb18'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', background: '#3b5bdb33',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#6e8efb', fontWeight: 700, fontSize: 13, flexShrink: 0,
                        }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          <div style={{ color: '#7c8db5', fontSize: 11 }}>@{u.username}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {fine && !selectedUser && fine.userName && !dropdownOpen && !userSearch && (
            <div style={{ fontSize: 11, color: '#ffa726', marginTop: 4 }}>
              ⚠ Multa no vinculada. Nombre original: <strong>{fine.userName}</strong>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Fecha</label>
          <input className="zetas-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Monto (COP)</label>
          <input className="zetas-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Motivo</label>
          <input className="zetas-input" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Ej: Inasistencia, No pagó, etc." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Estado</label>
          <select className="zetas-input" value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'paid')}>
            <option value="pending">Debe</option>
            <option value="paid">Pagado</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
