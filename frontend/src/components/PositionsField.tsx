import type { Position } from '../types';
import { POSITION_LABELS } from '../types';

interface PositionsFieldProps {
  value: Position[];
  onChange: (positions: Position[]) => void;
}

/** Checkbox group para seleccionar una o más posiciones de juego. */
export function PositionsField({ value, onChange }: PositionsFieldProps) {
  function toggle(pos: Position) {
    onChange(value.includes(pos) ? value.filter((p) => p !== pos) : [...value, pos]);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {(Object.entries(POSITION_LABELS) as Array<[Position, string]>).map(([pos, label]) => {
        const selected = value.includes(pos);
        return (
          <button
            key={pos}
            type="button"
            onClick={() => toggle(pos)}
            aria-pressed={selected}
            style={{
              padding: '5px 12px',
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: selected ? '1px solid #6e8efb' : '1px solid #3a4668',
              background: selected ? 'rgba(110,142,251,0.18)' : 'transparent',
              color: selected ? '#a5b8fc' : '#7c8db5',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
