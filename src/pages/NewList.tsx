import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { parseMessage } from '../utils/parser'
import { saveList, listTitleExists, getList } from '../utils/storage'
import type { ParseResult } from '../types'

const EXAMPLE = `VOLEY ING 6x6 VIE 17 ABR *7:50PM*

1.COPETE (830 pm)
2. Sam
3. 🟥
4. Juan
5. 🙋🏻‍♂️
6. sara liz
7. Isabella
8. Julián
9. Jaime
10. Cabrera

Espera:
1. Monica (Juan)
2. Keny (Juan)
3. Fernando (Yeison)`

export default function NewList() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [overwriteId, setOverwriteId] = useState<string | null>(null)

  function handleParse() {
    const parsed = parseMessage(text)
    setResult(parsed)
    setOverwriteId(null)

    if (parsed.success && parsed.data) {
      const existingId = listTitleExists(parsed.data.title)
      if (existingId) setOverwriteId(existingId)
    }
  }

  function handleCreate(force = false) {
    if (!result?.success || !result.data) return

    let id: string
    if (force && overwriteId) {
      const existing = getList(overwriteId)
      id = overwriteId
      saveList({
        id,
        title: result.data.title,
        rawMessage: text,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        mainList: result.data.mainList,
        waitList: result.data.waitList,
      })
    } else {
      id = crypto.randomUUID()
      saveList({
        id,
        title: result.data.title,
        rawMessage: text,
        createdAt: new Date().toISOString(),
        mainList: result.data.mainList,
        waitList: result.data.waitList,
      })
    }
    navigate(`/game/${id}`)
  }

  const canCreate = result?.success === true && overwriteId === null
  const needsConfirm = result?.success === true && overwriteId !== null

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#0f1020' }}>
      <Header title="Nueva Lista" backTo="/" backLabel="Inicio" />

      <main className="flex-1 px-4 py-5 flex flex-col gap-4 page-enter pb-10">

        {/* Textarea card */}
        <div className="section-panel">
          <div className="section-panel-header">
            <span className="font-bold text-sm" style={{ color: '#e8eaf6' }}>
              📋 Mensaje de WhatsApp
            </span>
          </div>
          <div className="p-3">
            <textarea
              className="zetas-textarea"
              placeholder={EXAMPLE}
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); setOverwriteId(null) }}
            />
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={handleParse}
          disabled={!text.trim()}
          className="btn btn-primary w-full">
          Analizar mensaje
        </button>

        {/* Error banner */}
        {result && result.errors.length > 0 && (
          <div className="rounded-2xl p-4 flex flex-col gap-2"
            style={{ background: 'rgba(231,76,60,0.15)', border: '2px solid #e74c3c' }}>
            <p className="font-bold text-sm flex items-center gap-2" style={{ color: '#e74c3c' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black"
                style={{ background: '#e74c3c', color: 'white' }}>✕</span>
              No se puede crear la lista
            </p>
            {result.errors.map((e, i) => (
              <p key={i} className="text-sm pl-7" style={{ color: '#f1948a' }}>{e.message}</p>
            ))}
          </div>
        )}

        {/* Warning banner */}
        {result?.success && result.warnings.length > 0 && (
          <div className="rounded-2xl p-4 flex flex-col gap-2"
            style={{ background: 'rgba(243,156,18,0.12)', border: '2px solid #f39c12' }}>
            <p className="font-bold text-sm flex items-center gap-2" style={{ color: '#f39c12' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black"
                style={{ background: '#f39c12', color: 'white' }}>!</span>
              {result.warnings.length} advertencia{result.warnings.length > 1 ? 's' : ''}
            </p>
            {result.warnings.map((w, i) => (
              <div key={i} className="text-xs pl-7" style={{ color: '#f0b429' }}>
                <span className="font-semibold">Línea {w.line}: </span>
                {w.message}
                <span className="block mt-0.5 font-mono opacity-60 truncate">"{w.raw}"</span>
              </div>
            ))}
          </div>
        )}

        {/* Overwrite confirm */}
        {needsConfirm && (
          <div className="section-panel">
            <div className="section-panel-header">
              <span className="font-bold text-sm" style={{ color: '#5c7cfa' }}>
                ⚠ Título duplicado
              </span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-sm" style={{ color: '#a5b4fc' }}>
                Ya existe una lista con el mismo título. ¿Qué deseas hacer?
              </p>
              <div className="flex gap-2">
                <button onClick={() => handleCreate(true)} className="btn btn-secondary flex-1 text-sm">
                  Reemplazar
                </button>
                <button onClick={() => { setOverwriteId(null); handleCreate(false) }} className="btn btn-primary flex-1 text-sm">
                  Crear nueva
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview */}
        {result?.success && result.data && (
          <div className="flex flex-col gap-3">
            <div className="section-panel">
              <div className="section-panel-header">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8b92b8' }}>
                  Vista previa
                </span>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(46,204,113,0.18)', color: '#2ecc71' }}>
                    {result.data.mainList.length} jugadores
                  </span>
                  {result.data.waitList.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(155,89,182,0.18)', color: '#9b59b6' }}>
                      {result.data.waitList.length} espera
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4">
                <p className="font-black text-base mb-3" style={{ color: '#e8eaf6' }}>
                  {result.data.title}
                </p>

                {/* Main list preview */}
                <div className="flex flex-col divide-y" style={{ borderColor: '#2a2f5a' }}>
                  {result.data.mainList.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm py-1.5">
                      <span className="text-xs w-6 text-right shrink-0 font-bold"
                        style={{ color: '#5c6bc0' }}>{p.position}.</span>
                      <span style={{ color: p.name ? '#e8eaf6' : '#4a5080' }}>
                        {p.name || '(vacío)'}
                      </span>
                      {p.note && (
                        <span className="text-xs ml-auto" style={{ color: '#8b92b8' }}>({p.note})</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Wait list preview */}
                {result.data.waitList.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider mt-4 mb-2"
                      style={{ color: '#9b59b6' }}>Lista de espera</p>
                    <div className="flex flex-col divide-y" style={{ borderColor: '#2a2f5a' }}>
                      {result.data.waitList.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-sm py-1.5">
                          <span className="text-xs w-6 text-right shrink-0 font-bold"
                            style={{ color: '#7e57c2' }}>{p.position}.</span>
                          <span style={{ color: '#e8eaf6' }}>{p.name || '(vacío)'}</span>
                          {p.note && (
                            <span className="text-xs ml-auto" style={{ color: '#8b92b8' }}>({p.note})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {canCreate && (
              <button onClick={() => handleCreate()} className="btn btn-success w-full text-base">
                Crear Lista ✓
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
