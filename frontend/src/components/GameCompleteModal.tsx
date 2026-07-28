import { useState } from 'react';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { getApiError } from '../services/api';
import { formatReportLine } from '../utils/format-report';
import { useGameMutations, useGamePreviewReport } from '../hooks/useGameQuery';

interface FineablePlayer {
  regId: string;
  userId: string;
  name: string;
  fineExempt: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onCompleted: () => void;
}

export function GameCompleteModal({ open, onClose, gameId, onCompleted }: Props) {
  const [error, setError] = useState('');
  const preview = useGamePreviewReport(gameId, open);
  const mutations = useGameMutations(gameId);
  const report = preview.data?.report ?? '';
  const fineable: FineablePlayer[] = preview.data?.fineable ?? [];
  const togglingId = mutations.setFineExempt.isPending
    ? mutations.setFineExempt.variables?.regId ?? null
    : null;

  async function handleToggleFine(player: FineablePlayer) {
    setError('');
    try {
      await mutations.setFineExempt.mutateAsync({
        regId: player.regId,
        exempt: !player.fineExempt,
      });
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleComplete() {
    setError('');
    try {
      await mutations.complete.mutateAsync();
      onCompleted();
      onClose();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  function handleClose() {
    if (mutations.complete.isPending) return;
    setError('');
    onClose();
  }

  const fined = fineable.filter((p) => !p.fineExempt);
  const exempted = fineable.filter((p) => p.fineExempt);

  return (
    <Modal open={open} onClose={handleClose} title="Terminar partido" width={560}>
      {preview.isPending ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner size={32} />
        </div>
      ) : (
        <>
          {(error || preview.error) && (
            <div style={{
              background: '#e031311a', border: '1px solid #e0313155',
              borderRadius: 8, padding: '10px 14px', color: '#ff6b6b',
              fontSize: 13, marginBottom: 16,
            }}>
              {error || getApiError(preview.error)}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <h4 style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>
              Vista previa del reporte
            </h4>
            <div style={{
              background: '#0f1020', borderRadius: 10, padding: 16,
              border: '1px solid #2a2f5a', fontSize: 13, lineHeight: 1.7,
              color: '#e8eaf6',
            }}>
              {report.split('\n').map((line, i) => (
                <div
                  key={i}
                  style={{ minHeight: line.trim() === '' ? 8 : undefined }}
                  dangerouslySetInnerHTML={{ __html: formatReportLine(line) || '&nbsp;' }}
                />
              ))}
            </div>
          </div>

          {fineable.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: '#7c8db5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>
                Multas ({fined.length} multado{fined.length !== 1 ? 's' : ''})
              </h4>
              <p style={{ color: '#7c8db5', fontSize: 12, margin: '0 0 10px' }}>
                Desmarca a quienes quieras perdonar la multa.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fineable.map((player) => (
                  <label
                    key={player.regId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: player.fineExempt ? '#2da44e0d' : '#e031310d',
                      border: `1px solid ${player.fineExempt ? '#2da44e33' : '#e0313133'}`,
                      cursor: togglingId === player.regId ? 'wait' : 'pointer',
                      opacity: togglingId === player.regId ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!player.fineExempt}
                      onChange={() => handleToggleFine(player)}
                      disabled={togglingId !== null}
                      style={{ accentColor: '#e03131', width: 16, height: 16 }}
                    />
                    <span style={{
                      color: '#e8eaf6', fontSize: 13, flex: 1,
                      textDecoration: player.fineExempt ? 'line-through' : 'none',
                    }}>
                      {player.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: player.fineExempt ? '#2da44e' : '#e03131',
                    }}>
                      {player.fineExempt ? 'Perdonado' : 'Multado'}
                    </span>
                  </label>
                ))}
              </div>
              {exempted.length > 0 && (
                <p style={{ color: '#2da44e', fontSize: 11, marginTop: 8, margin: '8px 0 0' }}>
                  {exempted.length} jugador{exempted.length !== 1 ? 'es' : ''} perdonado{exempted.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleClose} disabled={mutations.complete.isPending}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleComplete}
              disabled={mutations.complete.isPending}
            >
              {mutations.complete.isPending ? 'Terminando...' : 'Confirmar y Terminar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
