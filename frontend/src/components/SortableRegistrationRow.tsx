import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { GameRegistration } from '../types';
import { Avatar } from './Avatar';
import { displayName } from '../utils/display-name';

interface Props {
  reg: GameRegistration;
  index: number;
  isGameManager: boolean;
  readonly?: boolean;
  mainListFull?: boolean;
  onToggleAttended?: () => void;
  onTogglePaid?: () => void;
  onPromote?: () => void;
  onDemote?: () => void;
  onConfirm?: () => void;
  onRemove?: () => void;
  isSelf: boolean;
  allowSelfRemove: boolean;
  /** True when the current (non-admin) user is the member who invited this guest. */
  isOwnGuest?: boolean;
  draggable: boolean;
  onNameClick: () => void;
}

export function SortableRegistrationRow({
  reg,
  index,
  isGameManager,
  readonly: isReadonly,
  mainListFull,
  onToggleAttended,
  onTogglePaid,
  onPromote,
  onDemote,
  onConfirm,
  onRemove,
  isSelf,
  allowSelfRemove,
  isOwnGuest = false,
  draggable,
  onNameClick,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: reg.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: isSelf ? '#3b5bdb11' : '#1a1d38',
        borderRadius: 10,
        border: isSelf ? '1px solid #3b5bdb44' : '1px solid #2a2f5a',
        marginBottom: 6,
      }}
    >
      <span style={{ color: '#7c8db5', fontSize: 13, minWidth: 22, textAlign: 'right' }}>
        {index + 1}.
      </span>

      <div
        onClick={onNameClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <Avatar name={reg.isGuest ? reg.guestName || 'Invitado' : (reg.user ? displayName(reg.user) : '?')} photoUrl={reg.isGuest ? undefined : reg.user?.photoUrl} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#e8eaf6', fontSize: 14, fontWeight: isSelf ? 700 : 500 }}>
            {reg.isGuest ? (
              <>{reg.guestName || 'Invitado'} <span style={{ color: '#7c8db5', fontSize: 11 }}>👤 inv. de {reg.registeredBy ? displayName(reg.registeredBy) : '?'}</span></>
            ) : (
              reg.user ? displayName(reg.user) : '?'
            )}
            {isSelf && <span style={{ color: '#6e8efb', fontSize: 11, marginLeft: 6 }}>Tú</span>}
          </span>
          {reg.note && (
            <span style={{ color: '#7c8db5', fontSize: 12, marginLeft: 6 }}>({reg.note})</span>
          )}
          {reg.fromWaitList && (
            <span style={{ color: '#e3a008', fontSize: 11, marginLeft: 6 }}>↑ espera</span>
          )}
          {reg.pendingConfirmation && (
            <span style={{ color: '#f59f00', fontSize: 11, marginLeft: 6, background: '#f59f0022', padding: '1px 6px', borderRadius: 4 }}>⏳ pendiente</span>
          )}
          {reg.registeredById && reg.registeredById !== reg.userId && !reg.isGuest && reg.registeredBy && (
            <span style={{ color: '#7c8db5', fontSize: 11, marginLeft: 6 }}>por {displayName(reg.registeredBy)}</span>
          )}
        </div>
      </div>

      {isGameManager && !isReadonly && reg.pendingConfirmation && onConfirm && (
        <button
          onClick={onConfirm}
          title="Confirmar asistencia por este jugador"
          style={{
            background: '#2da44e22', border: '1px solid #2da44e55',
            borderRadius: 6, padding: '4px 8px',
            color: '#2da44e', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          Confirmar
        </button>
      )}

      {isGameManager && !isReadonly && (
        <>
          <button
            onClick={onToggleAttended}
            title="Asistió"
            style={{
              background: reg.attended ? '#2da44e22' : 'none',
              border: reg.attended ? '1px solid #2da44e55' : '1px solid #2a2f5a',
              borderRadius: 6, padding: '4px 8px',
              color: reg.attended ? '#2da44e' : '#7c8db5', cursor: 'pointer', fontSize: 13,
            }}
          >
            ✓
          </button>
          <button
            onClick={onTogglePaid}
            title="Pagó"
            style={{
              background: reg.paid ? '#e3a00822' : 'none',
              border: reg.paid ? '1px solid #e3a00855' : '1px solid #2a2f5a',
              borderRadius: 6, padding: '4px 8px',
              color: reg.paid ? '#e3a008' : '#7c8db5', cursor: 'pointer', fontSize: 13,
            }}
          >
            $
          </button>
          {reg.isWaitingList && !mainListFull && (
            <button
              onClick={onPromote}
              title="Promover a lista principal"
              style={{
                background: 'none', border: '1px solid #3b5bdb55',
                borderRadius: 6, padding: '4px 8px',
                color: '#6e8efb', cursor: 'pointer', fontSize: 13,
              }}
            >
              ↑
            </button>
          )}
          {!reg.isWaitingList && (
            <button
              onClick={onDemote}
              title="Mover a lista de espera"
              style={{
                background: 'none', border: '1px solid #e3a00855',
                borderRadius: 6, padding: '4px 8px',
                color: '#e3a008', cursor: 'pointer', fontSize: 13,
              }}
            >
              ↓
            </button>
          )}
        </>
      )}

      {isGameManager && !isReadonly && (
        <button
          onClick={() => {
            if (confirmRemove) {
              if (confirmTimer.current) clearTimeout(confirmTimer.current);
              setConfirmRemove(false);
              onRemove?.();
            } else {
              setConfirmRemove(true);
              confirmTimer.current = setTimeout(() => setConfirmRemove(false), 3000);
            }
          }}
          title={confirmRemove ? 'Confirmar eliminación' : 'Eliminar'}
          style={{
            background: confirmRemove ? '#e031311a' : 'none',
            border: confirmRemove ? '1px solid #e0313155' : '1px solid #2a2f5a',
            borderRadius: 6, padding: '4px 8px',
            color: confirmRemove ? '#ff6b6b' : '#7c8db5', cursor: 'pointer',
            fontSize: confirmRemove ? 11 : 13, fontWeight: confirmRemove ? 600 : 400,
            transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
        >
          {confirmRemove ? '¿Seguro?' : '✕'}
        </button>
      )}

      {draggable && (
        <span
          {...attributes}
          {...listeners}
          title="Reordenar"
          style={{
            color: '#7c8db5',
            cursor: 'grab',
            fontSize: 18,
            lineHeight: 1,
            touchAction: 'manipulation',
          }}
        >
          ⠿
        </span>
      )}

      {!isGameManager && allowSelfRemove && (isSelf || isOwnGuest) && (
        <button
          onClick={() => {
            if (confirmRemove) {
              if (confirmTimer.current) clearTimeout(confirmTimer.current);
              setConfirmRemove(false);
              onRemove?.();
            } else {
              setConfirmRemove(true);
              confirmTimer.current = setTimeout(() => setConfirmRemove(false), 3000);
            }
          }}
          title={isOwnGuest ? 'Sacar a tu invitado' : undefined}
          style={{
            background: confirmRemove ? '#e031311a' : 'none',
            border: confirmRemove ? '1px solid #e0313155' : '1px solid #2a2f5a',
            borderRadius: 8, padding: '4px 10px',
            color: confirmRemove ? '#ff6b6b' : '#7c8db5', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
        >
          {confirmRemove ? '¿Seguro?' : isOwnGuest ? 'Sacar' : 'Salirme'}
        </button>
      )}
    </div>
  );
}
