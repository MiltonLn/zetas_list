import { useEffect, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import type { GameList } from '../../types';
import { deleteLegacyList, getLegacyLists } from '../../utils/legacy-storage';

interface LegacyHomeProps {
  onNew: () => void;
  onSelect: (id: string) => void;
}

export function LegacyHome({ onNew, onSelect }: LegacyHomeProps) {
  // Flujo legado local: localStorage sigue siendo su única fuente de verdad.
  const [lists, setLists] = useState<GameList[]>([]);
  const confirmDelete = useConfirm();

  useEffect(() => {
    setLists(getLegacyLists().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, []);

  const handleDelete = (id: string) => {
    confirmDelete.press(() => {
      deleteLegacyList(id);
      setLists((prev) => prev.filter((list) => list.id !== id));
    }, id);
  };

  return (
    <div className="legacy-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="legacy-title">Parser (Legacy)</h1>
          <p className="legacy-subtitle" style={{ margin: 0 }}>
            Herramienta de respaldo — listas guardadas en este navegador
          </p>
        </div>
        <button onClick={onNew} className="legacy-btn-primary" style={{ whiteSpace: 'nowrap' }}>
          + Nueva Lista
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="legacy-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: '#8b92b8', fontSize: 14, margin: 0 }}>
            Sin listas aún. Pega un mensaje de WhatsApp para crear la primera.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lists.map((list) => {
            const attended = list.mainList.filter((player) => player.attended).length;
            const paid = list.mainList.filter((player) => player.paid).length;
            const total = list.mainList.length;
            const date = new Date(list.createdAt).toLocaleDateString('es-CO', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div key={list.id} className="legacy-panel" style={{ cursor: 'pointer' }}>
                <div onClick={() => onSelect(list.id)} style={{ padding: '16px 20px' }}>
                  <p style={{ color: '#e8eaf6', fontWeight: 800, fontSize: 15, margin: '0 0 10px' }}>
                    {list.title || '(Sin título)'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="legacy-stat legacy-stat-green">✓ {attended}/{total} asistieron</span>
                    <span className="legacy-stat legacy-stat-orange">$ {paid}/{total} pagaron</span>
                    {list.waitList.length > 0 && (
                      <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, background: 'rgba(155,89,182,0.12)', color: '#9b59b6', fontWeight: 600, border: '1px solid rgba(155,89,182,0.25)' }}>
                        ⏳ {list.waitList.length} espera
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#5c6bc0', fontSize: 12, fontWeight: 500, margin: '10px 0 0' }}>{date}</p>
                </div>
                <div style={{ borderTop: '1px solid #2a2f5a' }}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(list.id);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: 'none',
                      borderRadius: '0 0 16px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: confirmDelete.isArmed(list.id) ? 'white' : '#e74c3c',
                      background: confirmDelete.isArmed(list.id) ? '#e74c3c' : 'transparent',
                    }}
                  >
                    {confirmDelete.isArmed(list.id) ? '⚠ Confirmar eliminación' : 'Eliminar lista'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
