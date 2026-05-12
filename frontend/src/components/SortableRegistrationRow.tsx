import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { GameRegistration } from '../types';
import { Avatar } from './Avatar';

interface Props {
  reg: GameRegistration;
  index: number;
  isAdmin: boolean;
  onToggleAttended?: () => void;
  onTogglePaid?: () => void;
  onPromote?: () => void;
  onRemove?: () => void;
  isSelf: boolean;
  allowSelfRemove: boolean;
  draggable: boolean;
  onNameClick: () => void;
}

export function SortableRegistrationRow({
  reg,
  index,
  isAdmin,
  onToggleAttended,
  onTogglePaid,
  onPromote,
  onRemove,
  isSelf,
  allowSelfRemove,
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
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          style={{ color: '#2a2f5a', cursor: 'grab', fontSize: 18, lineHeight: 1, touchAction: 'none' }}
        >
          ⠿
        </span>
      )}

      <span style={{ color: '#7c8db5', fontSize: 13, minWidth: 22, textAlign: 'right' }}>
        {index + 1}.
      </span>

      <div
        onClick={onNameClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <Avatar name={reg.user.name} photoUrl={reg.user.photoUrl} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#e8eaf6', fontSize: 14, fontWeight: isSelf ? 700 : 500 }}>
            {reg.user.name}
            {isSelf && <span style={{ color: '#6e8efb', fontSize: 11, marginLeft: 6 }}>Tú</span>}
          </span>
          {reg.note && (
            <span style={{ color: '#7c8db5', fontSize: 12, marginLeft: 6 }}>({reg.note})</span>
          )}
          {reg.fromWaitList && (
            <span style={{ color: '#e3a008', fontSize: 11, marginLeft: 6 }}>↑ espera</span>
          )}
        </div>
      </div>

      {isAdmin && (
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
          {reg.isWaitingList && (
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
        </>
      )}

      {isAdmin && (
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

      {!isAdmin && allowSelfRemove && isSelf && (
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
          style={{
            background: confirmRemove ? '#e031311a' : 'none',
            border: confirmRemove ? '1px solid #e0313155' : '1px solid #2a2f5a',
            borderRadius: 8, padding: '4px 10px',
            color: confirmRemove ? '#ff6b6b' : '#7c8db5', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
        >
          {confirmRemove ? '¿Seguro?' : 'Salirme'}
        </button>
      )}
    </div>
  );
}
