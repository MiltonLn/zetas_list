import { useState } from 'react';
import type { ParseResult } from '../../types';
import { parseMessage } from '../../utils/parser';
import {
  getLegacyList,
  legacyTitleExists,
  saveLegacyList,
} from '../../utils/legacy-storage';

interface LegacyNewListProps {
  onCreated: (id: string) => void;
  onBack: () => void;
}

export function LegacyNewList({ onCreated, onBack }: LegacyNewListProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [overwriteId, setOverwriteId] = useState<string | null>(null);

  const handleParse = () => {
    const parsed = parseMessage(text);
    setResult(parsed);
    setOverwriteId(null);
    if (parsed.success && parsed.data) {
      const existingId = legacyTitleExists(parsed.data.title);
      if (existingId) setOverwriteId(existingId);
    }
  };

  const handleCreate = (force = false) => {
    if (!result?.success || !result.data) return;

    let id: string;
    if (force && overwriteId) {
      const existing = getLegacyList(overwriteId);
      id = overwriteId;
      saveLegacyList({
        id,
        title: result.data.title,
        rawMessage: text,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        mainList: result.data.mainList,
        waitList: result.data.waitList,
      });
    } else {
      id = crypto.randomUUID();
      saveLegacyList({
        id,
        title: result.data.title,
        rawMessage: text,
        createdAt: new Date().toISOString(),
        mainList: result.data.mainList,
        waitList: result.data.waitList,
      });
    }
    onCreated(id);
  };

  const canCreate = result?.success === true && overwriteId === null;
  const needsConfirm = result?.success === true && overwriteId !== null;

  return (
    <div className="legacy-page">
      <button onClick={onBack} className="legacy-back-btn">← Volver a listas</button>
      <h1 className="legacy-title" style={{ marginTop: 8 }}>Nueva Lista</h1>

      <div className="legacy-panel" style={{ marginTop: 16 }}>
        <div style={{ padding: '14px 18px 0' }}>
          <span style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 14 }}>📋 Mensaje de WhatsApp</span>
        </div>
        <div style={{ padding: '12px 18px 18px' }}>
          <textarea
            className="legacy-textarea"
            placeholder={`VOLEY ING 6x6 VIE 17 ABR *7:50PM*\n\n1. Jugador1\n2. Jugador2\n3. 🟥\n4. Jugador4\n...\n\nEspera o Inv 1:30pm:\n1. Jugador1 (Jugador2)\n2. 🟩`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setResult(null);
              setOverwriteId(null);
            }}
          />
        </div>
      </div>

      <button onClick={handleParse} disabled={!text.trim()} className="legacy-btn-primary" style={{ width: '100%', marginTop: 14 }}>
        Analizar mensaje
      </button>

      {result && result.errors.length > 0 && (
        <div className="legacy-alert legacy-alert-error" style={{ marginTop: 14 }}>
          <strong>No se puede crear la lista</strong>
          <ul>{result.errors.map((error, index) => <li key={index}>{error.message}</li>)}</ul>
        </div>
      )}

      {result?.success && result.warnings.length > 0 && (
        <div className="legacy-alert legacy-alert-warning" style={{ marginTop: 14 }}>
          <strong>{result.warnings.length} advertencia{result.warnings.length > 1 ? 's' : ''}</strong>
          <ul>{result.warnings.map((warning, index) => <li key={index}>Línea {warning.line}: {warning.message}</li>)}</ul>
        </div>
      )}

      {needsConfirm && (
        <div className="legacy-panel" style={{ marginTop: 14, padding: 18 }}>
          <p style={{ color: '#a5b4fc', fontSize: 14, margin: '0 0 12px' }}>
            ⚠ Ya existe una lista con el título <strong>"{result?.data?.title}"</strong>. ¿Qué deseas hacer?
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => handleCreate(true)} className="legacy-btn-ghost" style={{ flex: 1 }}>Reemplazar</button>
            <button onClick={() => { setOverwriteId(null); handleCreate(false); }} className="legacy-btn-primary" style={{ flex: 1 }}>Crear nueva</button>
          </div>
        </div>
      )}

      {result?.success && result.data && (
        <div className="legacy-panel" style={{ marginTop: 14 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a2f5a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8b92b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Vista previa</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="legacy-stat legacy-stat-green">{result.data.mainList.length} jugadores</span>
              {result.data.waitList.length > 0 && (
                <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, background: 'rgba(155,89,182,0.12)', color: '#9b59b6', fontWeight: 600 }}>
                  {result.data.waitList.length} espera
                </span>
              )}
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <p style={{ color: '#e8eaf6', fontWeight: 800, fontSize: 16, margin: '0 0 12px' }}>{result.data.title}</p>
            {result.data.mainList.map((player) => (
              <div key={player.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 }}>
                <span style={{ color: '#5c6bc0', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{player.position}.</span>
                <span style={{ color: player.name ? '#e8eaf6' : '#4a5080' }}>{player.name || '(vacío)'}</span>
                {player.note && <span style={{ color: '#8b92b8', fontSize: 12, marginLeft: 'auto' }}>({player.note})</span>}
              </div>
            ))}
            {result.data.waitList.length > 0 && (
              <>
                <p style={{ color: '#9b59b6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', margin: '14px 0 8px' }}>Lista de espera</p>
                {result.data.waitList.map((player) => (
                  <div key={player.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 }}>
                    <span style={{ color: '#7e57c2', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{player.position}.</span>
                    <span style={{ color: '#e8eaf6' }}>{player.name || '(vacío)'}</span>
                    {player.note && <span style={{ color: '#8b92b8', fontSize: 12, marginLeft: 'auto' }}>({player.note})</span>}
                  </div>
                ))}
              </>
            )}
          </div>

          {canCreate && (
            <div style={{ padding: '0 18px 18px' }}>
              <button onClick={() => handleCreate()} className="legacy-btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #2ecc71, #27ae60)' }}>
                Crear Lista ✓
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
