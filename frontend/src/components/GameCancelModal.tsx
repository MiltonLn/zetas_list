import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  gameTitle: string;
}

export function GameCancelModal({ open, onClose, onConfirm, gameTitle }: Props) {
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) return;
    setCancelling(true);
    try {
      await onConfirm(reason);
      setReason('');
    } finally {
      setCancelling(false);
    }
  }

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Cancelar ${gameTitle}`}>
      <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
        Razón de cancelación
      </label>
      <input
        className="zetas-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="No hay suficientes jugadores, lluvia..."
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn" style={{ flex: 1 }} onClick={handleClose}>Volver</button>
        <button
          className="btn"
          style={{ flex: 1, color: '#e03131', borderColor: '#e031312a' }}
          onClick={handleConfirm}
          disabled={cancelling || !reason.trim()}
        >
          {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
        </button>
      </div>
    </Modal>
  );
}
