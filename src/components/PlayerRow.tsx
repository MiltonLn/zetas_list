import { useState } from 'react'
import type { Player } from '../types'

interface PlayerRowProps {
  player: Player
  isWaitList?: boolean
  onUpdate: (updated: Player) => void
  onDelete: (id: string) => void
  onPromote?: (id: string) => void
}

export default function PlayerRow({ player, isWaitList, onUpdate, onDelete, onPromote }: PlayerRowProps) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(player.name)
  const [noteVal, setNoteVal] = useState(player.note)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function commitEdit() {
    onUpdate({ ...player, name: nameVal.trim(), note: noteVal.trim() })
    setEditing(false)
  }

  function handleDelete() {
    if (confirmDelete) {
      onDelete(player.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2500)
    }
  }

  const isEmpty = !player.name || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(player.name)

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{ background: '#1a1d38', border: '1px solid #2a2f5a' }}>

      {/* Position badge */}
      <span className="text-xs font-black w-6 shrink-0 text-center"
        style={{ color: '#5c6bc0' }}>
        {player.position}
      </span>

      {/* Name / edit area */}
      {editing ? (
        <div className="flex-1 flex flex-col gap-2 min-w-0 py-1">
          <input
            className="zetas-input"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            autoFocus
            placeholder="Nombre"
          />
          <input
            className="zetas-input"
            style={{ borderColor: '#2d3461', fontSize: '14px' }}
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
            placeholder="Nota (opcional)"
          />
          <div className="flex gap-2">
            <button onClick={commitEdit} className="btn btn-primary btn-sm flex-1">
              Guardar
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-secondary btn-sm px-4">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="flex-1 min-w-0 text-left py-0.5" onClick={() => setEditing(true)}>
          <span className={`block text-sm font-semibold truncate ${isEmpty ? 'italic' : ''}`}
            style={{ color: isEmpty ? '#4a5080' : '#e8eaf6' }}>
            {player.name || '(vacío)'}
          </span>
          {player.note && (
            <span className="block text-xs truncate mt-0.5" style={{ color: '#8b92b8' }}>
              {player.note}
            </span>
          )}
        </button>
      )}

      {/* Controls */}
      {!editing && (
        <div className="flex items-center gap-2 shrink-0">
          {/* Attended checkbox */}
          <label className="flex flex-col items-center gap-1 cursor-pointer" title="Asistió">
            <input
              type="checkbox"
              className="zetas-checkbox"
              checked={player.attended}
              onChange={(e) => onUpdate({ ...player, attended: e.target.checked })}
            />
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none"
              style={{ color: '#5c6bc0' }}>asistió</span>
          </label>

          {/* Paid checkbox */}
          <label className="flex flex-col items-center gap-1 cursor-pointer" title="Pagó $2.000">
            <input
              type="checkbox"
              className="zetas-checkbox paid"
              checked={player.paid}
              onChange={(e) => onUpdate({ ...player, paid: e.target.checked })}
            />
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none"
              style={{ color: '#5c6bc0' }}>pagó</span>
          </label>

          {/* Promote from wait list */}
          {isWaitList && onPromote && (
            <button
              onClick={() => onPromote(player.id)}
              title="Subir a lista principal"
              className="btn btn-icon btn-wait text-base">
              ↑
            </button>
          )}

          {/* Delete */}
          <button
            onClick={handleDelete}
            title={confirmDelete ? 'Confirmar eliminación' : 'Eliminar'}
            className="btn btn-icon transition-all"
            style={{
              background: confirmDelete ? '#e74c3c' : '#232645',
              color: confirmDelete ? 'white' : '#8b92b8',
              boxShadow: confirmDelete ? '0 2px 8px rgba(231,76,60,0.4)' : 'none',
            }}>
            {confirmDelete ? '!' : '×'}
          </button>
        </div>
      )}
    </div>
  )
}
