import { useState, useEffect, useRef } from 'react';
import { parseMessage } from '../utils/parser';
import { generateLegacyReport } from '../utils/legacy-report';
import {
  getLegacyLists,
  getLegacyList,
  saveLegacyList,
  deleteLegacyList,
  legacyTitleExists,
} from '../utils/legacy-storage';
import { formatCurrency } from '../utils/currency';
import { useConfirm } from '../hooks/useConfirm';
import type { Player, GameList, ParseResult } from '../types';

type View = 'home' | 'new' | 'detail';

export default function LegacyParserPage() {
  const [view, setView] = useState<View>('home');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const goHome = () => { setView('home'); setActiveGameId(null); };
  const goNew = () => setView('new');
  const goDetail = (id: string) => { setActiveGameId(id); setView('detail'); };

  if (view === 'new') return <LegacyNewList onCreated={goDetail} onBack={goHome} />;
  if (view === 'detail' && activeGameId) return <LegacyGameDetail gameId={activeGameId} onBack={goHome} />;
  return <LegacyHome onNew={goNew} onSelect={goDetail} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME — List of saved games
// ═══════════════════════════════════════════════════════════════════════════════

function LegacyHome({ onNew, onSelect }: { onNew: () => void; onSelect: (id: string) => void }) {
  const [lists, setLists] = useState<GameList[]>([]);
  const confirmDelete = useConfirm();

  useEffect(() => {
    setLists(getLegacyLists().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, []);

  const handleDelete = (id: string) => {
    confirmDelete.press(() => {
      deleteLegacyList(id);
      setLists((prev) => prev.filter((l) => l.id !== id));
    }, id);
  };

  return (
    <div className="legacy-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="legacy-title">Parser (Legacy)</h1>
          <p className="legacy-subtitle" style={{ margin: 0 }}>
            Herramienta de respaldo — listas guardadas en este navegador
          </p>
        </div>
        <button onClick={onNew} className="legacy-btn-primary" style={{ whiteSpace: 'nowrap' }}>
          + Nueva Lista
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="legacy-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: '#8b92b8', fontSize: 14, margin: 0 }}>
            Sin listas aún. Pega un mensaje de WhatsApp para crear la primera.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lists.map((list) => {
            const attended = list.mainList.filter((p) => p.attended).length;
            const paid = list.mainList.filter((p) => p.paid).length;
            const total = list.mainList.length;
            const date = new Date(list.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

            return (
              <div key={list.id} className="legacy-panel" style={{ cursor: 'pointer' }}>
                <div onClick={() => onSelect(list.id)} style={{ padding: '16px 20px' }}>
                  <p style={{ color: '#e8eaf6', fontWeight: 800, fontSize: 15, margin: '0 0 10px' }}>
                    {list.title || '(Sin título)'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="legacy-stat legacy-stat-green">✓ {attended}/{total} asistieron</span>
                    <span className="legacy-stat legacy-stat-orange">$ {paid}/{total} pagaron</span>
                    {list.waitList.length > 0 && (
                      <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, background: 'rgba(155,89,182,0.12)', color: '#9b59b6', fontWeight: 600, border: '1px solid rgba(155,89,182,0.25)' }}>
                        ⏳ {list.waitList.length} espera
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#5c6bc0', fontSize: 12, fontWeight: 500, margin: '10px 0 0' }}>{date}</p>
                </div>
                <div style={{ borderTop: '1px solid #2a2f5a' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(list.id); }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: 'none',
                      borderRadius: '0 0 16px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: confirmDelete.isArmed(list.id) ? 'white' : '#e74c3c',
                      background: confirmDelete.isArmed(list.id) ? '#e74c3c' : 'transparent',
                    }}
                  >
                    {confirmDelete.isArmed(list.id) ? '⚠ Confirmar eliminación' : 'Eliminar lista'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW LIST — Parse WhatsApp message
// ═══════════════════════════════════════════════════════════════════════════════

function LegacyNewList({ onCreated, onBack }: { onCreated: (id: string) => void; onBack: () => void }) {
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
            onChange={(e) => { setText(e.target.value); setResult(null); setOverwriteId(null); }}
          />
        </div>
      </div>

      <button onClick={handleParse} disabled={!text.trim()} className="legacy-btn-primary" style={{ width: '100%', marginTop: 14 }}>
        Analizar mensaje
      </button>

      {result && result.errors.length > 0 && (
        <div className="legacy-alert legacy-alert-error" style={{ marginTop: 14 }}>
          <strong>No se puede crear la lista</strong>
          <ul>{result.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}

      {result?.success && result.warnings.length > 0 && (
        <div className="legacy-alert legacy-alert-warning" style={{ marginTop: 14 }}>
          <strong>{result.warnings.length} advertencia{result.warnings.length > 1 ? 's' : ''}</strong>
          <ul>{result.warnings.map((w, i) => <li key={i}>Línea {w.line}: {w.message}</li>)}</ul>
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
            {result.data.mainList.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 }}>
                <span style={{ color: '#5c6bc0', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{p.position}.</span>
                <span style={{ color: p.name ? '#e8eaf6' : '#4a5080' }}>{p.name || '(vacío)'}</span>
                {p.note && <span style={{ color: '#8b92b8', fontSize: 12, marginLeft: 'auto' }}>({p.note})</span>}
              </div>
            ))}
            {result.data.waitList.length > 0 && (
              <>
                <p style={{ color: '#9b59b6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', margin: '14px 0 8px' }}>Lista de espera</p>
                {result.data.waitList.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 }}>
                    <span style={{ color: '#7e57c2', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{p.position}.</span>
                    <span style={{ color: '#e8eaf6' }}>{p.name || '(vacío)'}</span>
                    {p.note && <span style={{ color: '#8b92b8', fontSize: 12, marginLeft: 'auto' }}>({p.note})</span>}
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

// ═══════════════════════════════════════════════════════════════════════════════
// GAME DETAIL — Attendance, payment, report
// ═══════════════════════════════════════════════════════════════════════════════

function LegacyGameDetail({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const [game, setGame] = useState<GameList | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const found = getLegacyList(gameId);
    if (!found) { onBack(); return; }
    setGame(found);
  }, [gameId, onBack]);

  const persist = (updated: GameList) => {
    setGame(updated);
    saveLegacyList(updated);
  };

  const updatePlayer = (updated: Player, inWaitList: boolean) => {
    if (!game) return;
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : game.mainList.map((p) => (p.id === updated.id ? updated : p)),
      waitList: inWaitList ? game.waitList.map((p) => (p.id === updated.id ? updated : p)) : game.waitList,
    });
  };

  const deletePlayer = (playerId: string, inWaitList: boolean) => {
    if (!game) return;
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : game.mainList.filter((p) => p.id !== playerId),
      waitList: inWaitList ? game.waitList.filter((p) => p.id !== playerId) : game.waitList,
    });
  };

  const promotePlayer = (playerId: string) => {
    if (!game) return;
    const player = game.waitList.find((p) => p.id === playerId);
    if (!player) return;
    const nextPos = game.mainList.length > 0 ? Math.max(...game.mainList.map((p) => p.position)) + 1 : 1;
    persist({
      ...game,
      mainList: [...game.mainList, { ...player, id: crypto.randomUUID(), position: nextPos }],
      waitList: game.waitList.filter((p) => p.id !== playerId),
    });
  };

  const copyReport = async () => {
    if (!game) return;
    const report = generateLegacyReport(game.title, game.mainList, game.waitList);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = report;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  if (!game) return null;

  const totalAttended = game.mainList.filter((p) => p.attended).length;
  const totalPaid = game.mainList.filter((p) => p.paid).length;
  const waitPaid = game.waitList.filter((p) => p.paid).length;
  const totalCollected = (totalPaid + waitPaid) * 2000;

  return (
    <div className="legacy-page">
      <button onClick={onBack} className="legacy-back-btn">← Volver a listas</button>
      <h1 className="legacy-game-title" style={{ marginTop: 8 }}>{game.title}</h1>

      {/* Summary */}
      <div className="legacy-panel" style={{ marginTop: 16 }}>
        <div className="legacy-panel-label">RESUMEN DEL PARTIDO</div>
        <div className="legacy-summary-grid">
          <div className="legacy-summary-cell">
            <span className="legacy-summary-label">Asistieron</span>
            <span className="legacy-summary-value" style={{ color: '#2ecc71' }}>{totalAttended}/{game.mainList.length}</span>
          </div>
          <div className="legacy-summary-cell">
            <span className="legacy-summary-label">Pagaron</span>
            <span className="legacy-summary-value" style={{ color: '#f39c12' }}>{totalPaid + waitPaid}</span>
          </div>
          <div className="legacy-summary-cell">
            <span className="legacy-summary-label">Recaudado</span>
            <span className="legacy-summary-value" style={{ color: '#5c7cfa' }}>{formatCurrency(totalCollected)}</span>
          </div>
        </div>
        <button onClick={copyReport} className={`legacy-report-btn ${copied ? 'copied' : ''}`}>
          {copied ? <><CheckIcon /> ¡Copiado al portapapeles!</> : <><WhatsAppIcon /> Generar reporte del día</>}
        </button>
      </div>

      {/* Main list */}
      <LegacyListSection
        title="Lista principal"
        count={game.mainList.length}
        maxSlots={18}
        players={game.mainList}
        onUpdate={(p) => updatePlayer(p, false)}
        onDelete={(id) => deletePlayer(id, false)}
        accentColor="#3b5bdb"
      />

      {/* Wait list */}
      {game.waitList.length > 0 && (
        <LegacyListSection
          title="Lista de espera"
          count={game.waitList.length}
          players={game.waitList}
          isWaitList
          onUpdate={(p) => updatePlayer(p, true)}
          onDelete={(id) => deletePlayer(id, true)}
          onPromote={promotePlayer}
          accentColor="#9b59b6"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function LegacyListSection({
  title, count, maxSlots, players, isWaitList, onUpdate, onDelete, onPromote, accentColor,
}: {
  title: string;
  count: number;
  maxSlots?: number;
  players: Player[];
  isWaitList?: boolean;
  onUpdate: (p: Player) => void;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
  accentColor: string;
}) {
  const attended = players.filter((p) => p.attended).length;
  const paid = players.filter((p) => p.paid).length;
  const total = maxSlots ?? players.length;

  return (
    <div className="legacy-panel" style={{ marginTop: 16 }}>
      <div className="legacy-section-header">
        <div className="legacy-section-title-row">
          <div className="legacy-accent-bar" style={{ background: accentColor }} />
          <h2 className="legacy-section-title">{title}</h2>
          <span className="legacy-section-badge">{count}{maxSlots ? `/${maxSlots}` : ''}</span>
        </div>
      </div>

      <div className="legacy-stats-row">
        <span className="legacy-stat legacy-stat-green">✓ {attended}/{total} asistieron</span>
        <span className="legacy-stat legacy-stat-orange">$ {paid}/{total} · {formatCurrency(paid * 2000)}</span>
      </div>

      <div className="legacy-player-list">
        {players.map((p) => (
          <LegacyPlayerRow
            key={p.id}
            player={p}
            isWaitList={isWaitList}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onPromote={onPromote}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER ROW
// ═══════════════════════════════════════════════════════════════════════════════

function LegacyPlayerRow({
  player, isWaitList, onUpdate, onDelete, onPromote,
}: {
  player: Player;
  isWaitList?: boolean;
  onUpdate: (p: Player) => void;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
}) {
  const confirmDelete = useConfirm({ timeoutMs: 2500 });

  const handleDelete = () => {
    confirmDelete.press(() => onDelete(player.id));
  };

  const isEmpty = !player.name || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(player.name);

  return (
    <div className="legacy-player-row">
      <span className="legacy-player-pos">{player.position}</span>

      <div className="legacy-player-info">
        <span className={`legacy-player-name ${isEmpty ? 'empty' : ''}`}>
          {player.name || '(vacío)'}
        </span>
        {player.note && <span className="legacy-player-note">{player.note}</span>}
      </div>

      <div className="legacy-player-controls">
        <label className="legacy-checkbox-label" title="Asistió">
          <input
            type="checkbox"
            className="legacy-checkbox green"
            checked={player.attended}
            onChange={(e) => onUpdate({ ...player, attended: e.target.checked })}
          />
          <span className="legacy-checkbox-text">ASISTIÓ</span>
        </label>

        <label className="legacy-checkbox-label" title="Pagó">
          <input
            type="checkbox"
            className="legacy-checkbox orange"
            checked={player.paid}
            onChange={(e) => onUpdate({ ...player, paid: e.target.checked })}
          />
          <span className="legacy-checkbox-text">PAGÓ</span>
        </label>

        {isWaitList && onPromote && (
          <button onClick={() => onPromote(player.id)} className="legacy-icon-btn promote" title="Subir a lista principal">↑</button>
        )}

        <button
          onClick={handleDelete}
          className={`legacy-icon-btn ${confirmDelete.isArmed() ? 'danger' : ''}`}
          title={confirmDelete.isArmed() ? 'Confirmar' : 'Eliminar'}
        >
          {confirmDelete.isArmed() ? '!' : '×'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
