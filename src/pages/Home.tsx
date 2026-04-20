import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import EmptyState from '../components/EmptyState'
import { getLists, deleteList } from '../utils/storage'
import type { GameList } from '../types'

export default function Home() {
  const [lists, setLists] = useState<GameList[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    const all = getLists().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    setLists(all)
  }, [])

  function handleDelete(id: string) {
    if (confirmDelete === id) {
      deleteList(id)
      setLists((prev) => prev.filter((l) => l.id !== id))
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete((cur) => (cur === id ? null : cur)), 3000)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#0f1020' }}>
      <Header />

      <main className="flex-1 px-4 py-5 flex flex-col gap-4 page-enter pb-24">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 py-6">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Zetas"
            className="w-24 h-24 rounded-full object-cover"
            style={{ border: '3px solid #3b5bdb', boxShadow: '0 0 24px rgba(59,91,219,0.4)' }}
          />
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight" style={{ color: '#e8eaf6' }}>
              Asistencia Zetas
            </h2>
            <p className="text-sm mt-0.5" style={{ color: '#8b92b8' }}>
              Control de asistencia y pagos del equipo
            </p>
          </div>
        </div>

        {/* Lists */}
        {lists.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Sin listas aún"
            description="Pega un mensaje de WhatsApp para crear la primera lista"
            action={
              <Link to="/new" className="btn btn-primary">
                + Nueva Lista
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-xs uppercase tracking-widest px-1"
              style={{ color: '#5c6bc0' }}>
              Listas recientes
            </h3>
            {lists.map((list) => {
              const attended = list.mainList.filter((p) => p.attended).length
              const paid = list.mainList.filter((p) => p.paid).length
              const total = list.mainList.length
              const date = new Date(list.createdAt).toLocaleDateString('es-CO', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
              return (
                <div key={list.id} className="section-panel">
                  <Link to={`/game/${list.id}`} className="block p-4">
                    <p className="font-black text-sm leading-tight mb-3" style={{ color: '#e8eaf6' }}>
                      {list.title || '(Sin título)'}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2.5 py-1.5 rounded-xl font-semibold"
                        style={{ background: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)' }}>
                        ✓ {attended}/{total} asistieron
                      </span>
                      <span className="px-2.5 py-1.5 rounded-xl font-semibold"
                        style={{ background: 'rgba(243,156,18,0.15)', color: '#f39c12', border: '1px solid rgba(243,156,18,0.25)' }}>
                        $ {paid}/{total} pagaron
                      </span>
                      {list.waitList.length > 0 && (
                        <span className="px-2.5 py-1.5 rounded-xl font-semibold"
                          style={{ background: 'rgba(155,89,182,0.15)', color: '#9b59b6', border: '1px solid rgba(155,89,182,0.25)' }}>
                          ⏳ {list.waitList.length} espera
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-3 font-medium" style={{ color: '#5c6bc0' }}>{date}</p>
                  </Link>
                  <div className="flex" style={{ borderTop: '1px solid #2a2f5a' }}>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="btn flex-1 rounded-none"
                      style={{
                        minHeight: '44px',
                        borderRadius: '0 0 20px 20px',
                        fontSize: '13px',
                        color: confirmDelete === list.id ? 'white' : '#e74c3c',
                        background: confirmDelete === list.id ? '#e74c3c' : 'transparent',
                        boxShadow: 'none',
                      }}>
                      {confirmDelete === list.id ? '⚠ Confirmar eliminación' : 'Eliminar lista'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* FAB */}
      {lists.length > 0 && (
        <Link to="/new"
          className="fixed bottom-6 right-5 w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ background: '#3b5bdb', color: 'white', boxShadow: '0 4px 16px rgba(59,91,219,0.5)' }}
          aria-label="Nueva lista">
          +
        </Link>
      )}
    </div>
  )
}
