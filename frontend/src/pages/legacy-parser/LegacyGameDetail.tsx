import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import type { GameList, Player } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { generateLegacyReport } from '../../utils/legacy-report';
import { getLegacyList, saveLegacyList } from '../../utils/legacy-storage';

interface LegacyGameDetailProps {
  gameId: string;
  onBack: () => void;
}

export function LegacyGameDetail({ gameId, onBack }: LegacyGameDetailProps) {
  const [game, setGame] = useState<GameList | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const found = getLegacyList(gameId);
    if (!found) {
      onBack();
      return;
    }
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
      mainList: inWaitList ? game.mainList : game.mainList.map((player) => (player.id === updated.id ? updated : player)),
      waitList: inWaitList ? game.waitList.map((player) => (player.id === updated.id ? updated : player)) : game.waitList,
    });
  };

  const deletePlayer = (playerId: string, inWaitList: boolean) => {
    if (!game) return;
    persist({
      ...game,
      mainList: inWaitList ? game.mainList : game.mainList.filter((player) => player.id !== playerId),
      waitList: inWaitList ? game.waitList.filter((player) => player.id !== playerId) : game.waitList,
    });
  };

  const promotePlayer = (playerId: string) => {
    if (!game) return;
    const player = game.waitList.find((candidate) => candidate.id === playerId);
    if (!player) return;
    const nextPosition = game.mainList.length > 0
      ? Math.max(...game.mainList.map((candidate) => candidate.position)) + 1
      : 1;
    persist({
      ...game,
      mainList: [...game.mainList, { ...player, id: crypto.randomUUID(), position: nextPosition }],
      waitList: game.waitList.filter((candidate) => candidate.id !== playerId),
    });
  };

  const copyReport = async () => {
    if (!game) return;
    const report = generateLegacyReport(game.title, game.mainList, game.waitList);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  if (!game) return null;

  const totalAttended = game.mainList.filter((player) => player.attended).length;
  const totalPaid = game.mainList.filter((player) => player.paid).length;
  const waitPaid = game.waitList.filter((player) => player.paid).length;
  const totalCollected = (totalPaid + waitPaid) * 2000;

  return (
    <div className="legacy-page">
      <button onClick={onBack} className="legacy-back-btn">← Volver a listas</button>
      <h1 className="legacy-game-title" style={{ marginTop: 8 }}>{game.title}</h1>

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
          {copied
            ? <><CheckIcon /> ¡Copiado al portapapeles!</>
            : <><WhatsAppIcon /> Generar reporte del día</>}
        </button>
      </div>

      <LegacyListSection
        title="Lista principal"
        count={game.mainList.length}
        maxSlots={18}
        players={game.mainList}
        onUpdate={(player) => updatePlayer(player, false)}
        onDelete={(id) => deletePlayer(id, false)}
        accentColor="#3b5bdb"
      />

      {game.waitList.length > 0 && (
        <LegacyListSection
          title="Lista de espera"
          count={game.waitList.length}
          players={game.waitList}
          isWaitList
          onUpdate={(player) => updatePlayer(player, true)}
          onDelete={(id) => deletePlayer(id, true)}
          onPromote={promotePlayer}
          accentColor="#9b59b6"
        />
      )}
    </div>
  );
}

interface LegacyListSectionProps {
  title: string;
  count: number;
  maxSlots?: number;
  players: Player[];
  isWaitList?: boolean;
  onUpdate: (player: Player) => void;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
  accentColor: string;
}

function LegacyListSection({
  title,
  count,
  maxSlots,
  players,
  isWaitList,
  onUpdate,
  onDelete,
  onPromote,
  accentColor,
}: LegacyListSectionProps) {
  const attended = players.filter((player) => player.attended).length;
  const paid = players.filter((player) => player.paid).length;
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
        {players.map((player) => (
          <LegacyPlayerRow
            key={player.id}
            player={player}
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

interface LegacyPlayerRowProps {
  player: Player;
  isWaitList?: boolean;
  onUpdate: (player: Player) => void;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
}

function LegacyPlayerRow({
  player,
  isWaitList,
  onUpdate,
  onDelete,
  onPromote,
}: LegacyPlayerRowProps) {
  const confirmDelete = useConfirm({ timeoutMs: 2500 });
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
            onChange={(event) => onUpdate({ ...player, attended: event.target.checked })}
          />
          <span className="legacy-checkbox-text">ASISTIÓ</span>
        </label>
        <label className="legacy-checkbox-label" title="Pagó">
          <input
            type="checkbox"
            className="legacy-checkbox orange"
            checked={player.paid}
            onChange={(event) => onUpdate({ ...player, paid: event.target.checked })}
          />
          <span className="legacy-checkbox-text">PAGÓ</span>
        </label>
        {isWaitList && onPromote && (
          <button onClick={() => onPromote(player.id)} className="legacy-icon-btn promote" title="Subir a lista principal">↑</button>
        )}
        <button
          onClick={() => confirmDelete.press(() => onDelete(player.id))}
          className={`legacy-icon-btn ${confirmDelete.isArmed() ? 'danger' : ''}`}
          title={confirmDelete.isArmed() ? 'Confirmar' : 'Eliminar'}
        >
          {confirmDelete.isArmed() ? '!' : '×'}
        </button>
      </div>
    </div>
  );
}

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
