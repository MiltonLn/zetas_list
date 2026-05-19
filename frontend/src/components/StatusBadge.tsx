import type { GameStatus } from '../types';
import { GAME_STATUS_LABELS } from '../types';

const STATUS_COLORS: Record<GameStatus, string> = {
  scheduled: '#7c8db5',
  registration_open: '#2da44e',
  in_progress: '#e3a008',
  completed: '#3b5bdb',
  cancelled: '#e03131',
};

export function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: STATUS_COLORS[status] + '22',
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}55`,
      }}
    >
      {GAME_STATUS_LABELS[status]}
    </span>
  );
}
