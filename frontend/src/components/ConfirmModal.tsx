import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      {message && (
        <p style={{ color: '#7c8db5', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
          {message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          className="btn btn-sm"
          onClick={onConfirm}
          disabled={loading}
          style={{
            background: danger ? '#e031311a' : '#3b5bdb1a',
            color: danger ? '#ef5350' : '#6e8efb',
            border: `1px solid ${danger ? '#e0313133' : '#3b5bdb44'}`,
          }}
        >
          {loading ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
