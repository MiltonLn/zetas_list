import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useQuery } from '@tanstack/react-query';
import { gamesService } from '../services/games.service';
import type { GameRegistration } from '../types';
import { MODALIDAD_LABELS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAvailableMembers, useGameAudit, useGameMutations, useGameQuery } from '../hooks/useGameQuery';
import { queryKeys } from '../lib/query-client';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/Spinner';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { GameAuditModal } from '../components/GameAuditModal';
import { GameCancelModal } from '../components/GameCancelModal';
import { GameCompleteModal } from '../components/GameCompleteModal';
import { RegisterOtherModal } from '../components/RegisterOtherModal';
import { showToast } from '../utils/toast';
import { getApiError } from '../services/api';
import {
  CompletionReport,
  GameSummary,
  RegistrationActions,
} from '../components/game-detail/GameDetailSections';
import { GameRegistrationLists } from '../components/game-detail/GameRegistrationLists';

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isGameManager } = useAuth();

  const { data: game, isPending: loading, error: loadError, invalidate: refreshGame } = useGameQuery(id);

  const [error, setError] = useState('');
  const [regError, setRegError] = useState('');
  const gameMutations = useGameMutations(id ?? '');

  // Drag-and-drop reorders optimistically and only persists after a pause, so
  // the dragged order has to live outside the query cache until it settles.
  const [mainList, setMainList] = useState<GameRegistration[]>([]);
  const [waitList, setWaitList] = useState<GameRegistration[]>([]);

  const [showAudit, setShowAudit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [selectedReg, setSelectedReg] = useState<GameRegistration | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showRegisterOther, setShowRegisterOther] = useState(false);

  const { data: auditLogs = [], isFetching: auditLoading } = useGameAudit(id, showAudit);

  const { data: availableMembers = [] } = useAvailableMembers(
    id,
    showRegisterOther,
  );

  const { data: completionReport = null, isPending: reportLoading } = useQuery({
    queryKey: queryKeys.gameReport(id ?? ''),
    queryFn: async () => (await gamesService.getReport(id!)).data.report,
    enabled: !!id && game?.status === 'completed',
  });

  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderPending = useRef(false);
  const expectedReorder = useRef<{ mainList: string[]; waitList: string[] } | null>(null);
  const [reorderInFlight, setReorderInFlight] = useState(false);
  const mainListRef = useRef(mainList);
  const waitListRef = useRef(waitList);

  useEffect(() => { mainListRef.current = mainList; }, [mainList]);
  useEffect(() => { waitListRef.current = waitList; }, [waitList]);

  useEffect(() => {
    if (!game) return;
    const byPosition = (a: GameRegistration, b: GameRegistration) => a.position - b.position;
    const gameMainList = game.registrations.filter((r) => !r.isWaitingList).sort(byPosition);
    const gameWaitList = game.registrations.filter((r) => r.isWaitingList).sort(byPosition);

    if (reorderPending.current) {
      const expected = expectedReorder.current;
      const hasExpectedOrder = expected
        && expected.mainList.join('\0') === gameMainList.map((r) => r.id).join('\0')
        && expected.waitList.join('\0') === gameWaitList.map((r) => r.id).join('\0');
      if (!hasExpectedOrder) return;

      reorderPending.current = false;
      expectedReorder.current = null;
      setReorderInFlight(false);
    }

    setMainList(gameMainList);
    setWaitList(gameWaitList);
  }, [game, reorderInFlight]);

  useEffect(() => () => {
    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
  }, []);

  function handleDragEnd(event: DragEndEvent, listType: 'main' | 'wait') {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const list = listType === 'main' ? mainList : waitList;
    const setList = listType === 'main' ? setMainList : setWaitList;

    const oldIndex = list.findIndex((r) => r.id === active.id);
    const newIndex = list.findIndex((r) => r.id === over.id);
    const newList = arrayMove(list, oldIndex, newIndex);
    const updatedMain = listType === 'main' ? newList : mainListRef.current;
    const updatedWait = listType === 'wait' ? newList : waitListRef.current;
    const reorderPayload = {
      mainList: updatedMain.map((r) => r.id),
      waitList: updatedWait.map((r) => r.id),
    };
    setList(newList);
    reorderPending.current = true;
    expectedReorder.current = reorderPayload;
    setReorderInFlight(true);

    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
    const timeout = setTimeout(() => {
      gameMutations.reorder
        .mutateAsync(reorderPayload)
        .catch((e) => {
          if (expectedReorder.current !== reorderPayload) return;
          setError(getApiError(e));
          reorderPending.current = false;
          expectedReorder.current = null;
          setReorderInFlight(false);
        })
        .then(() => {
          if (reorderTimeout.current === timeout) reorderTimeout.current = null;
        });
    }, 600);
    reorderTimeout.current = timeout;
  }

  async function handleRegister() {
    if (!id) return;
    setRegError('');
    try {
      await gameMutations.register.mutateAsync();
      showToast('¡Te anotaste correctamente!');
    } catch (e) {
      setRegError(getApiError(e));
    }
  }

  async function handleToggle(regId: string, field: 'attended' | 'paid', currentValue: boolean) {
    if (!id) return;
    try {
      await gameMutations.updateRegistration.mutateAsync({
        regId,
        data: { [field]: !currentValue },
      });
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleRemove(userId: string | null, regId?: string) {
    if (!id) return;
    try {
      await gameMutations.removeRegistration.mutateAsync({ userId: userId || 'guest', regId });
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handlePromote(regId: string) {
    if (!id) return;
    try {
      await gameMutations.promote.mutateAsync(regId);
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleDemote(regId: string) {
    if (!id) return;
    try {
      await gameMutations.demote.mutateAsync(regId);
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleCancel(reason: string) {
    if (!id) return;
    try {
      await gameMutations.cancel.mutateAsync(reason);
      setShowCancel(false);
    } catch (e) {
      setError(getApiError(e));
    }
  }

  async function handleConfirm() {
    if (!id) return;
    try {
      await gameMutations.confirm.mutateAsync();
      showToast('¡Confirmaste tu asistencia!');
    } catch (e) {
      setRegError(getApiError(e));
    }
  }

  async function handleConfirmFor(regId: string) {
    if (!id) return;
    try {
      await gameMutations.confirmFor.mutateAsync(regId);
      showToast('Confirmación registrada');
    } catch (e) {
      setError(getApiError(e));
    }
  }

  function loadAudit() {
    setShowAudit(true);
  }

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
          <p style={{ color: '#ff6b6b' }}>
            {error || (loadError ? getApiError(loadError) : '') || 'Partido no encontrado'}
          </p>
          <Link to="/" className="btn" style={{ marginTop: 12 }}>Volver</Link>
        </div>
      </div>
    );
  }

  const isOpen = game.status === 'registration_open' || game.status === 'in_progress';
  const isFinished = game.status === 'completed' || game.status === 'cancelled';
  const isAlreadyRegistered = mainList.some((r) => r.userId === user?.id) || waitList.some((r) => r.userId === user?.id);
  const spotsLeft = Math.max(0, game.maxMainSpots - mainList.length);
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
  const attended = allRegs.filter((r) => r.attended).length;

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
          <GameSummary
            mainCount={mainList.length}
            maxMainSpots={game.maxMainSpots}
            attended={attended}
            paid={totalPaid}
            collected={recaudado}
          />
        )}

        {game.status === 'completed' && (
          <CompletionReport report={completionReport} loading={reportLoading} />
        )}

        {isOpen && (
          <RegistrationActions
            hasPendingConfirmation={hasPendingConfirmation}
            isAlreadyRegistered={isAlreadyRegistered}
            spotsLeft={spotsLeft}
            registrationError={regError}
            registering={gameMutations.register.isPending}
            onConfirm={handleConfirm}
            onRemoveSelf={() => {
              if (user) void handleRemove(user.id);
            }}
            onRegister={handleRegister}
            onRegisterOther={() => setShowRegisterOther(true)}
          />
        )}

        <GameRegistrationLists
          mainList={mainList}
          waitList={waitList}
          maxMainSpots={game.maxMainSpots}
          currentUserId={user?.id}
          isGameManager={isGameManager}
          isFinished={isFinished}
          isOpen={isOpen}
          onDragEnd={handleDragEnd}
          onToggle={handleToggle}
          onPromote={handlePromote}
          onDemote={handleDemote}
          onConfirm={handleConfirmFor}
          onRemove={handleRemove}
          onSelect={setSelectedReg}
        />

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
          onCompleted={refreshGame}
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
          onSuccess={refreshGame}
        />
      )}
    </>
  );
}
