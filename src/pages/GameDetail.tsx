import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import ListSection from '../components/ListSection'
import EmptyState from '../components/EmptyState'
import { getList, saveList } from '../utils/storage'
import type { GameList, Player } from '../types'

export default function GameDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameList | null>(null)

  useEffect(() => {
    if (!id) return
    const found = getList(id)
    if (!found) {
      navigate('/')
      return
    }
    setGame(found)
  }, [id, navigate])

  function persist(updated: GameList) {
    setGame(updated)
    saveList(updated)
  }

  function updatePlayer(updated: Player, inWaitList: boolean) {
    if (!game) return
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : game.mainList.map((p) => (p.id === updated.id ? updated : p)),
      waitList: inWaitList ? game.waitList.map((p) => (p.id === updated.id ? updated : p)) : game.waitList,
    })
  }

  function deletePlayer(playerId: string, inWaitList: boolean) {
    if (!game) return
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : game.mainList.filter((p) => p.id !== playerId),
      waitList: inWaitList ? game.waitList.filter((p) => p.id !== playerId) : game.waitList,
    })
  }

  function addPlayer(name: string, note: string, inWaitList: boolean) {
    if (!game) return
    const list = inWaitList ? game.waitList : game.mainList
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      position: (list.length > 0 ? Math.max(...list.map((p) => p.position)) : 0) + 1,
      name, note, attended: false, paid: false,
    }
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : [...game.mainList, newPlayer],
      waitList: inWaitList ? [...game.waitList, newPlayer] : game.waitList,
    })
  }

  function promotePlayer(playerId: string) {
    if (!game) return
    const player = game.waitList.find((p) => p.id === playerId)
    if (!player) return
    const nextPos = game.mainList.length > 0 ? Math.max(...game.mainList.map((p) => p.position)) + 1 : 1
    persist({
      ...game,
      mainList: [...game.mainList, { ...player, id: crypto.randomUUID(), position: nextPos, fromWaitList: true }],
      waitList: game.waitList.filter((p) => p.id !== playerId),
    })
  }

  if (!game) return null

  const totalAttended = game.mainList.filter((p) => p.attended).length
  const totalPaid = game.mainList.filter((p) => p.paid).length
  const waitPaid = game.waitList.filter((p) => p.paid).length
  const totalCollected = (totalPaid + waitPaid) * 2000

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#0f1020' }}>
      <Header title={game.title || 'Detalle'} backTo="/" backLabel="Inicio" />

      <main className="flex-1 px-4 py-5 flex flex-col gap-5 page-enter pb-10">

        {/* Global summary */}
        <div className="section-panel">
          <div className="section-panel-header">
            <span className="font-bold text-xs uppercase tracking-widest" style={{ color: '#8b92b8' }}>
              Resumen del partido
            </span>
          </div>
          <div className="grid grid-cols-3 divide-x p-0" style={{ borderColor: '#2a2f5a' }}>
            {[
              { label: 'Asistieron', value: `${totalAttended}/${game.mainList.length}`, color: '#2ecc71', bg: 'rgba(46,204,113,0.08)' },
              { label: 'Pagaron', value: `${totalPaid + waitPaid}`, color: '#f39c12', bg: 'rgba(243,156,18,0.08)' },
              { label: 'Recaudado', value: `$${totalCollected.toLocaleString('es-CO')}`, color: '#5c7cfa', bg: 'rgba(92,124,250,0.08)' },
            ].map(({ label, value, color, bg }, i) => (
              <div key={label} className="p-4 text-center"
                style={{ background: bg, borderColor: '#2a2f5a', borderRight: i < 2 ? '1px solid #2a2f5a' : 'none' }}>
                <p className="text-xs font-medium mb-1" style={{ color: '#8b92b8' }}>{label}</p>
                <p className="font-black text-lg leading-tight" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Lists */}
        {game.mainList.length === 0 && game.waitList.length === 0 ? (
          <EmptyState icon="🏐" title="Sin jugadores" description="Agrega jugadores a la lista" />
        ) : (
          <>
            <ListSection
              title="Lista principal"
              players={game.mainList}
              maxSlots={18}
              onUpdate={(p) => updatePlayer(p, false)}
              onDelete={(pid) => deletePlayer(pid, false)}
              onAdd={(name, note) => addPlayer(name, note, false)}
              accentColor="#3b5bdb"
            />

            <ListSection
              title="Lista de espera"
              players={game.waitList}
              isWaitList
              onUpdate={(p) => updatePlayer(p, true)}
              onDelete={(pid) => deletePlayer(pid, true)}
              onPromote={promotePlayer}
              onAdd={(name, note) => addPlayer(name, note, true)}
              accentColor="#9b59b6"
            />
          </>
        )}
      </main>
    </div>
  )
}
