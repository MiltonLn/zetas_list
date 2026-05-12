import type { AuditLog } from '../types';
import { AUDIT_ACTION_LABELS } from '../types';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  logs: AuditLog[];
  loading: boolean;
}

export function GameAuditModal({ open, onClose, logs, loading }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Registro de Actividad" width={640}>
      {loading ? (
        <p style={{ color: '#7c8db5', textAlign: 'center' }}>Cargando...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: '#7c8db5', textAlign: 'center' }}>Sin actividad registrada</p>
      ) : (
        logs.map((log) => (
          <div key={log.id} style={{ borderBottom: '1px solid #2a2f5a', paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ color: '#e8eaf6', fontSize: 13, fontWeight: 600 }}>
                {AUDIT_ACTION_LABELS[log.action] ?? log.action}
              </span>
              <span style={{ color: '#7c8db5', fontSize: 11 }}>
                {new Date(log.createdAt).toLocaleString('es-CO')}
              </span>
            </div>
            <p style={{ color: '#7c8db5', fontSize: 12, margin: '4px 0 0' }}>
              Por {log.actor.name}
              {log.targetUser && ` → ${log.targetUser.name}`}
            </p>
          </div>
        ))
      )}
    </Modal>
  );
}
