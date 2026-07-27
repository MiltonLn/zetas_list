import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { gamesService } from '../services/games.service';
import type { Game, GameRegistration, AuditLog } from '../types';
import { MODALIDAD_LABELS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useGameStream } from '../hooks/useGameStream';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/Spinner';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { SortableRegistrationRow } from '../components/SortableRegistrationRow';
import { GameAuditModal } from '../components/GameAuditModal';
import { GameCancelModal } from '../components/GameCancelModal';
import { GameCompleteModal } from '../components/GameCompleteModal';
import { RegisterOtherModal } from '../components/RegisterOtherModal';
import { showToast } from '../utils/toast';
import { getApiError } from '../services/api';
import { formatReportLine } from '../utils/format-report';
import { formatCurrency } from '../utils/currency';

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isGameManager } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  const [mainList, setMainList] = useState<GameRegistration[]>([]);
  const [waitList, setWaitList] = useState<GameRegistration[]>([]);

  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [showCancel, setShowCancel] = useState(false);

  const [selectedReg, setSelectedReg] = useState<GameRegistration | null>(null);

  const [showComplete, setShowComplete] = useState(false);

  const [completionReport, setCompletionReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [availableMembers, setAvailableMembers] = useState<Array<{ id: string; name: string; phone: string; username: string }>>([]);
  const [showRegisterOther, setShowRegisterOther] = useState(false);

  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainListRef = useRef(mainList);
  const waitListRef = useRef(waitList);

  useEffect(() => { mainListRef.current = mainList; }, [mainList]);
  useEffect(() => { waitListRef.current = waitList; }, [waitList]);

  const fetchGame = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await gamesService.get(id);
      setGame(data);
      setMainList(data.registrations.filter((r) => !r.isWaitingList).sort((a, b) => a.position - b.position));
      setWaitList(data.registrations.filter((r) => r.isWaitingList).sort((a, b) => a.position - b.position));
    } catch (e) {
      setError(getApiError(e));
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchGame().finally(() => setLoading(false));
  }, [fetchGame]);

  useEffect(() => {
    if (game && (game.status === 'registration_open' || game.status === 'in_progress')) {
      loadAvailableMembers();
    }
  }, [game?.status, game?.registrations?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useGameStream(id, fetchGame);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent, listType: 'main' | 'wait') {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const list = listType === 'main' ? mainList : waitList;
    const setList = listType === 'main' ? setMainList : setWaitList;

    const oldIndex = list.findIndex((r) => r.id === active.id);
    const newIndex = list.findIndex((r) => r.id === over.id);
    const newList = arrayMove(list, oldIndex, newIndex);
    setList(newList);

    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
    reorderTimeout.current = setTimeout(() => {
      const updatedMain = listType === 'main' ? newList : mainListRef.current;
      const updatedWait = listType === 'wait' ? newList : waitListRef.current;
      gamesService
        .reorder(id!, updatedMain.map((r) => r.id), updatedWait.map((r) => r.id))
        .catch((e) => {
          setError(getApiError(e));
          fetchGame();
        });
    }, 600);
  }

  async function handleRegister() {
    if (!id) return;
    setRegError('');
    setRegistering(true);
    try {
      await gamesService.register(id);
      showToast('¡Te anotaste correctamente!');
      fetchGame();
    } catch (e) {
      setRegError(getApiError(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleToggle(regId: string, field: 'attended' | 'paid', currentValue: boolean) {
    if (!id) return;
    try {
      await gamesService.updateRegistration(id, regId, { [field]: !currentValue });
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleRemove(userId: string | null, regId?: string) {
    if (!id) return;
    try {
      await gamesService.removeRegistration(id, userId || 'guest', regId);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handlePromote(regId: string) {
    if (!id) return;
    try {
      await gamesService.promote(id, regId);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleDemote(regId: string) {
    if (!id) return;
    try {
      await gamesService.demote(id, regId);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleCancel(reason: string) {
    if (!id) return;
    try {
      await gamesService.cancel(id, reason);
      setShowCancel(false);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function loadAvailableMembers() {
    if (!id) return;
    try {
      const { data } = await gamesService.getAvailableMembers(id);
      setAvailableMembers(data);
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleConfirm() {
    if (!id) return;
    try {
      await gamesService.confirmRegistration(id);
      showToast('¡Confirmaste tu asistencia!');
      fetchGame();
    } catch (e) {
      setRegError(getApiError(e));
    }
  }

  async function handleConfirmFor(regId: string) {
    if (!id) return;
    try {
      await gamesService.confirmRegistrationById(id, regId);
      showToast('Confirmación registrada');
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function loadAudit() {
    if (!id) return;
    setAuditLoading(true);
    try {
      const { data } = await gamesService.getAudit(id);
      setAuditLogs(data);
      setShowAudit(true);
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (game?.status === 'completed' && id) {
      setReportLoading(true);
      gamesService.getReport(id)
        .then(({ data }) => setCompletionReport(data.report))
        .catch(() => setCompletionReport(null))
        .finally(() => setReportLoading(false));
    }
  }, [game?.status, id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Spinner size={48} />
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ff6b6b' }}>{error || 'Partido no encontrado'}</p>
          <Link to="/" className="btn" style={{ marginTop: 12 }}>Volver</Link>
        </div>
      </div>
    );
  }

  const isOpen = game.status === 'registration_open' || game.status === 'in_progress';
  const isFinished = game.status === 'completed' || game.status === 'cancelled';
  const isAlreadyRegistered = mainList.some((r) => r.userId === user?.id) || waitList.some((r) => r.userId === user?.id);
  const spotsLeft = Math.max(0, game.maxMainSpots - mainList.length);
  const mainListFull = mainList.length >= game.maxMainSpots;
  const allRegs = [...mainList, ...waitList];
  const proxyCount = allRegs.filter((r) => r.registeredById === user?.id && r.userId !== user?.id && !r.isGuest).length;
  const proxyLimitReached = !isGameManager && proxyCount >= game.maxProxyRegistrations;
  const hasPendingConfirmation = allRegs.some(
    (r) => r.userId === user?.id && r.pendingConfirmation,
  );

  const paidMain = mainList.filter((r) => r.paid).length;
  const paidWait = waitList.filter((r) => r.paid).length;
  const totalPaid = paidMain + paidWait;
  const recaudado = totalPaid * game.pricePerPlayer;
  const attended = mainList.filter((r) => r.attended).length;

  return (
    <>
      <PageHeader
        title={game.title}
        backTo="/"
        action={
          isGameManager ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {(game.status === 'registration_open' || game.status === 'in_progress') && (
                <button
                  onClick={() => setShowComplete(true)}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '6px 12px', minHeight: 34 }}
                >
                  ✅ Terminar
                </button>
              )}
              {isAdmin && game.status !== 'completed' && game.status !== 'cancelled' && (
                <button
                  onClick={() => setShowCancel(true)}
                  style={{
                    background: 'none',
                    border: '1px solid #e031312a',
                    borderRadius: 8,
                    padding: '6px 10px',
                    color: '#e03131',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          ) : null
        }
      />

      <div className="page-wrapper">
        {error && (
          <div style={{ background: '#e031311a', border: '1px solid #e0313155', borderRadius: 10, padding: '10px 14px', color: '#ff6b6b', fontSize: 14, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StatusBadge status={game.status} />
          <span style={{ color: '#7c8db5', fontSize: 13 }}>
            {MODALIDAD_LABELS[game.modalidad]}
          </span>
          {isOpen && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4, color: '#2da44e', fontSize: 12,
              background: '#2da44e11', padding: '2px 8px', borderRadius: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2da44e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              En vivo
            </span>
          )}
        </div>

        {isGameManager && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8, marginBottom: 16,
          }}>
            {[
              { label: 'Anotados', value: `${mainList.length}/${game.maxMainSpots}` },
              { label: 'Asistieron', value: `${attended}` },
              { label: 'Pagaron', value: `${totalPaid}` },
              { label: 'Recaudado', value: formatCurrency(recaudado) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: '#161829', border: '1px solid #2a2f5a',
                borderRadius: 10, padding: '10px 12px', textAlign: 'center',
              }}>
                <div style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 16 }}>{value}</div>
                <div style={{ color: '#7c8db5', fontSize: 11 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {game.status === 'completed' && (
          <div style={{
            background: '#0f1020', borderRadius: 12, padding: 16,
            border: '1px solid #2a2f5a', marginBottom: 20,
          }}>
            <h3 style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
              📋 Reporte del partido
            </h3>
            {reportLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                <Spinner size={24} />
              </div>
            ) : completionReport ? (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: '#e8eaf6' }}>
                {completionReport.split('\n').map((line, i) => (
                  <div
                    key={i}
                    style={{ minHeight: line.trim() === '' ? 8 : undefined }}
                    dangerouslySetInnerHTML={{
                      __html: formatReportLine(line) || '&nbsp;',
                    }}
                  />
                ))}
              </div>
            ) : (
              <p style={{ color: '#7c8db5', fontSize: 13 }}>No se pudo cargar el reporte</p>
            )}
          </div>
        )}

        {isOpen && (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            {hasPendingConfirmation && (
              <div style={{
                background: '#f59f0011', border: '1px solid #f59f0033',
                borderRadius: 14, padding: '14px 20px', marginBottom: 12,
              }}>
                <p style={{ color: '#f59f00', fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>
                  ⏳ Tienes una confirmación pendiente
                </p>
                <button
                  onClick={handleConfirm}
                  style={{
                    background: '#2da44e', border: 'none', borderRadius: 10,
                    padding: '10px 24px', color: '#fff', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700,
                  }}
                >
                  Confirmar asistencia
                </button>
              </div>
            )}
            {isAlreadyRegistered ? (
              <div style={{
                background: '#2da44e11', border: '1px solid #2da44e33',
                borderRadius: 14, padding: '16px 20px',
              }}>
                <p style={{ color: '#2da44e', fontWeight: 700, fontSize: 16, margin: 0 }}>
                  ✅ Ya estás anotado
                </p>
                <button
                  onClick={() => handleRemove(user!.id)}
                  style={{
                    background: 'none', border: '1px solid #2a2f5a',
                    borderRadius: 8, padding: '6px 14px', color: '#7c8db5',
                    cursor: 'pointer', fontSize: 12, marginTop: 10,
                  }}
                >
                  Desanotarme
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: '#7c8db5', fontSize: 13, marginBottom: 10 }}>
                  {spotsLeft > 0
                    ? `Quedan ${spotsLeft} cupos en la lista principal`
                    : 'La lista principal está llena — quedarás en espera'}
                </p>
                {regError && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8 }}>{regError}</p>}
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  style={{
                    background: '#3b5bdb', border: 'none', borderRadius: 14,
                    padding: '14px 32px', color: '#fff', cursor: 'pointer',
                    fontSize: 18, fontWeight: 800, width: '100%', maxWidth: 300,
                    opacity: registering ? 0.7 : 1,
                    boxShadow: '0 4px 20px #3b5bdb44',
                  }}
                >
                  {registering ? 'Anotando...' : '🏐 ¡Anotame!'}
                </button>
              </div>
            )}

            <button
              onClick={() => setShowRegisterOther(true)}
              style={{
                background: 'none', border: '1px solid #3b5bdb55',
                borderRadius: 10, padding: '10px 20px', color: '#6e8efb',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                marginTop: 12, transition: 'all 0.15s',
              }}
            >
              + Anotar a alguien más
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ color: '#e8eaf6', fontSize: 15, fontWeight: 700, margin: 0 }}>
            Lista Principal
            <span style={{
              marginLeft: 8, background: '#2a2f5a', borderRadius: 12,
              padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#7c8db5',
            }}>
              {mainList.length}/{game.maxMainSpots}
            </span>
          </h2>
        </div>

        {isGameManager ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'main')}>
            <SortableContext items={mainList.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {mainList.map((reg, i) => (
                <SortableRegistrationRow
                  key={reg.id}
                  reg={reg}
                  index={i}
                  isGameManager={isGameManager}
                  readonly={isFinished}
                  mainListFull={mainListFull}
                  onToggleAttended={() => handleToggle(reg.id, 'attended', reg.attended)}
                  onTogglePaid={() => handleToggle(reg.id, 'paid', reg.paid)}
                  onPromote={() => handlePromote(reg.id)}
                  onDemote={() => handleDemote(reg.id)}
                  onConfirm={() => handleConfirmFor(reg.id)}
                  onRemove={() => handleRemove(reg.userId, reg.isGuest ? reg.id : undefined)}
                  isSelf={reg.userId === user?.id}
                  allowSelfRemove={isOpen}
                  draggable={isGameManager && !isFinished}
                  onNameClick={() => setSelectedReg(reg)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          mainList.map((reg, i) => (
            <SortableRegistrationRow
              key={reg.id}
              reg={reg}
              index={i}
              isGameManager={false}
              onRemove={() => handleRemove(reg.userId, reg.isGuest ? reg.id : undefined)}
              isSelf={reg.userId === user?.id}
              allowSelfRemove={isOpen}
              isOwnGuest={reg.isGuest && reg.registeredById === user?.id}
              draggable={false}
              onNameClick={() => setSelectedReg(reg)}
            />
          ))
        )}

        {mainList.length === 0 && (
          <p style={{ color: '#7c8db5', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Sin anotados aún
          </p>
        )}

        {waitList.length > 0 && (
          <>
            <h2 style={{ color: '#e8eaf6', fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>
              Lista de Espera
              <span style={{
                marginLeft: 8, background: '#2a2f5a', borderRadius: 12,
                padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#7c8db5',
              }}>
                {waitList.length}
              </span>
            </h2>
            {isGameManager ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'wait')}>
                <SortableContext items={waitList.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {waitList.map((reg, i) => (
                    <SortableRegistrationRow
                      key={reg.id}
                      reg={reg}
                      index={i}
                      isGameManager={isGameManager}
                      readonly={isFinished}
                      mainListFull={mainListFull}
                      onToggleAttended={() => handleToggle(reg.id, 'attended', reg.attended)}
                      onTogglePaid={() => handleToggle(reg.id, 'paid', reg.paid)}
                      onPromote={() => handlePromote(reg.id)}
                      onDemote={() => handleDemote(reg.id)}
                      onConfirm={() => handleConfirmFor(reg.id)}
                      onRemove={() => handleRemove(reg.userId, reg.isGuest ? reg.id : undefined)}
                      isSelf={reg.userId === user?.id}
                      allowSelfRemove={isOpen}
                      draggable={isGameManager && !isFinished}
                      onNameClick={() => setSelectedReg(reg)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              waitList.map((reg, i) => (
                <SortableRegistrationRow
                  key={reg.id}
                  reg={reg}
                  index={i}
                  isGameManager={false}
                  onRemove={() => handleRemove(reg.userId, reg.isGuest ? reg.id : undefined)}
                  isSelf={reg.userId === user?.id}
                  allowSelfRemove={isOpen}
                  isOwnGuest={reg.isGuest && reg.registeredById === user?.id}
                  draggable={false}
                  onNameClick={() => setSelectedReg(reg)}
                />
              ))
            )}
          </>
        )}

        <div style={{ marginTop: 28, borderTop: '1px solid #2a2f5a', paddingTop: 20 }}>
            <button
              onClick={loadAudit}
              disabled={auditLoading}
              style={{
                background: 'none', border: '1px solid #2a2f5a',
                borderRadius: 10, padding: '10px 16px', color: '#7c8db5',
                cursor: 'pointer', fontSize: 13, width: '100%',
              }}
            >
              {auditLoading ? 'Cargando...' : '📋 Ver registro de actividad'}
            </button>
          </div>
      </div>

      {/* Player profile modal */}
      {selectedReg && selectedReg.user && (
        <PlayerProfileModal
          user={selectedReg.user}
          listInfo={{
            position: selectedReg.position,
            isWaitingList: selectedReg.isWaitingList,
            fromWaitList: selectedReg.fromWaitList,
          }}
          onClose={() => setSelectedReg(null)}
        />
      )}

      <GameAuditModal
        open={showAudit}
        onClose={() => setShowAudit(false)}
        logs={auditLogs}
        loading={auditLoading}
      />

      <GameCancelModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        gameTitle={game?.title ?? 'Partido'}
      />

      {id && (
        <GameCompleteModal
          open={showComplete}
          onClose={() => setShowComplete(false)}
          gameId={id}
          onCompleted={fetchGame}
        />
      )}

      {id && (
        <RegisterOtherModal
          open={showRegisterOther}
          onClose={() => setShowRegisterOther(false)}
          gameId={id}
          availableMembers={availableMembers}
          isUserRegistered={isAlreadyRegistered}
          isGameManager={isGameManager}
          proxyLimitReached={proxyLimitReached}
          maxProxyRegistrations={game.maxProxyRegistrations}
          onSuccess={() => { fetchGame(); loadAvailableMembers(); }}
        />
      )}
    </>
  );
}
