import { useState } from 'react'
import type { Player } from '../types'
import PlayerRow from './PlayerRow'

interface ListSectionProps {
  title: string
  players: Player[]
  isWaitList?: boolean
  maxSlots?: number
  onUpdate: (updated: Player) => void
  onDelete: (id: string) => void
  onPromote?: (id: string) => void
  onAdd: (name: string, note: string) => void
  accentColor?: string
}

export default function ListSection({
  title,
  players,
  isWaitList,
  maxSlots,
  onUpdate,
  onDelete,
  onPromote,
  onAdd,
  accentColor,
}: ListSectionProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNote, setNewNote] = useState('')

  function handleAdd() {
    if (!newName.trim()) return
    onAdd(newName.trim(), newNote.trim())
    setNewName('')
    setNewNote('')
    setAdding(false)
  }

  const attended = players.filter((p) => p.attended).length
  const paid = players.filter((p) => p.paid).length
  const total = maxSlots ?? players.length

  const accent = accentColor ?? '#3b5bdb'

  return (
    <section className="section-panel">
      {/* Section header */}
      <div className="section-panel-header">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />
          <h2 className="font-black text-base" style={{ color: '#e8eaf6' }}>{title}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: '#1e2240', color: '#8b92b8', border: '1px solid #2d3461' }}>
            {players.length}{maxSlots ? `/${maxSlots}` : ''}
          </span>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn btn-sm"
          style={{ background: accent, color: 'white', boxShadow: `0 2px 8px ${accent}55` }}>
          + Agregar
        </button>
      </div>

      <div className="section-panel-body">
        {/* Summary stats */}
        {players.length > 0 && (
          <div className="flex gap-2 text-xs flex-wrap pb-1">
            <span className="px-2.5 py-1.5 rounded-xl font-semibold"
              style={{ background: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)' }}>
              ✓ {attended}/{total} asistieron
            </span>
            <span className="px-2.5 py-1.5 rounded-xl font-semibold"
              style={{ background: 'rgba(243,156,18,0.15)', color: '#f39c12', border: '1px solid rgba(243,156,18,0.25)' }}>
              $ {paid}/{total} · ${(paid * 2000).toLocaleString('es-CO')}
            </span>
          </div>
        )}

        {/* Add form */}
        {adding && (
          <div className="flex flex-col gap-2 p-3 rounded-xl"
            style={{ background: '#0f1020', border: '2px solid #3d4580' }}>
            <input
              className="zetas-input"
              placeholder="Nombre del jugador"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              autoFocus
            />
            <input
              className="zetas-input"
              style={{ borderColor: '#2d3461' }}
              placeholder="Nota (opcional)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <div className="flex gap-2 pt-1">
              <button onClick={handleAdd} className="btn flex-1 btn-sm"
                style={{ background: accent, color: 'white' }}>
                Agregar
              </button>
              <button onClick={() => { setAdding(false); setNewName(''); setNewNote('') }}
                className="btn btn-secondary btn-sm px-4">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Player list */}
        {players.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: '#4a5080' }}>
            {isWaitList ? 'Sin lista de espera' : 'Sin jugadores'}
          </p>
        ) : (
          players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              isWaitList={isWaitList}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onPromote={onPromote}
            />
          ))
        )}
      </div>
    </section>
  )
}
