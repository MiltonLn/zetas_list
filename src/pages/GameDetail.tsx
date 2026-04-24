import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import ListSection from '../components/ListSection'
import EmptyState from '../components/EmptyState'
import { getList, saveList } from '../utils/storage'
import { generateWhatsAppReport } from '../utils/report'
import type { GameList, Player } from '../types'

export default function GameDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameList | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  async function copyReport() {
    if (!game) return
    const message = generateWhatsAppReport(game)
    try {
      await navigator.clipboard.writeText(message)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = message
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 2500)
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

          {/* WhatsApp report button */}
          <div className="px-4 pb-4 pt-3">
            <button
              onClick={copyReport}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 font-bold text-sm transition-all active:scale-95"
              style={{
                background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(37,211,102,0.12)',
                border: `1px solid ${copied ? '#2ecc71' : 'rgba(37,211,102,0.3)'}`,
                color: copied ? '#2ecc71' : '#25d366',
              }}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  ¡Copiado al portapapeles!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Generar reporte del día
                </>
              )}
            </button>
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
