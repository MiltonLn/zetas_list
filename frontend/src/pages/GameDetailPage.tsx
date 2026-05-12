import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { gamesService } from '../services/games.service';
import type { Game, GameRegistration, AuditLog } from '../types';
import { MODALIDAD_LABELS, AUDIT_ACTION_LABELS, POSITION_LABELS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useGameStream } from '../hooks/useGameStream';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/Spinner';
import { Avatar, resolvePhotoUrl } from '../components/Avatar';
import { getApiError } from '../services/api';

function SortableRow({
  reg,
  index,
  isAdmin,
  onToggleAttended,
  onTogglePaid,
  onPromote,
  onRemove,
  isSelf,
  allowSelfRemove,
  draggable,
  onNameClick,
}: {
  reg: GameRegistration;
  index: number;
  isAdmin: boolean;
  onToggleAttended?: () => void;
  onTogglePaid?: () => void;
  onPromote?: () => void;
  onRemove?: () => void;
  isSelf: boolean;
  allowSelfRemove: boolean;
  draggable: boolean;
  onNameClick: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: reg.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: isSelf ? '#3b5bdb11' : '#1a1d38',
        borderRadius: 10,
        border: isSelf ? '1px solid #3b5bdb44' : '1px solid #2a2f5a',
        marginBottom: 6,
      }}
    >
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          style={{ color: '#2a2f5a', cursor: 'grab', fontSize: 18, lineHeight: 1, touchAction: 'none' }}
        >
          ⠿
        </span>
      )}

      <span style={{ color: '#7c8db5', fontSize: 13, minWidth: 22, textAlign: 'right' }}>
        {index + 1}.
      </span>

      <div
        onClick={onNameClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <Avatar name={reg.user.name} photoUrl={reg.user.photoUrl} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#e8eaf6', fontSize: 14, fontWeight: isSelf ? 700 : 500 }}>
            {reg.user.name}
            {isSelf && <span style={{ color: '#6e8efb', fontSize: 11, marginLeft: 6 }}>Tú</span>}
          </span>
          {reg.note && (
            <span style={{ color: '#7c8db5', fontSize: 12, marginLeft: 6 }}>({reg.note})</span>
          )}
          {reg.fromWaitList && (
            <span style={{ color: '#e3a008', fontSize: 11, marginLeft: 6 }}>↑ espera</span>
          )}
        </div>
      </div>

      {isAdmin && (
        <>
          <button
            onClick={onToggleAttended}
            title="Asistió"
            style={{
              background: reg.attended ? '#2da44e22' : 'none',
              border: reg.attended ? '1px solid #2da44e55' : '1px solid #2a2f5a',
              borderRadius: 6, padding: '4px 8px',
              color: reg.attended ? '#2da44e' : '#7c8db5', cursor: 'pointer', fontSize: 13,
            }}
          >
            ✓
          </button>
          <button
            onClick={onTogglePaid}
            title="Pagó"
            style={{
              background: reg.paid ? '#e3a00822' : 'none',
              border: reg.paid ? '1px solid #e3a00855' : '1px solid #2a2f5a',
              borderRadius: 6, padding: '4px 8px',
              color: reg.paid ? '#e3a008' : '#7c8db5', cursor: 'pointer', fontSize: 13,
            }}
          >
            $
          </button>
          {reg.isWaitingList && (
            <button
              onClick={onPromote}
              title="Promover a lista principal"
              style={{
                background: 'none', border: '1px solid #3b5bdb55',
                borderRadius: 6, padding: '4px 8px',
                color: '#6e8efb', cursor: 'pointer', fontSize: 13,
              }}
            >
              ↑
            </button>
          )}
        </>
      )}

      {isAdmin && (
        <button
          onClick={() => {
            if (confirmRemove) {
              if (confirmTimer.current) clearTimeout(confirmTimer.current);
              setConfirmRemove(false);
              onRemove?.();
            } else {
              setConfirmRemove(true);
              confirmTimer.current = setTimeout(() => setConfirmRemove(false), 3000);
            }
          }}
          title={confirmRemove ? 'Confirmar eliminación' : 'Eliminar'}
          style={{
            background: confirmRemove ? '#e031311a' : 'none',
            border: confirmRemove ? '1px solid #e0313155' : '1px solid #2a2f5a',
            borderRadius: 6, padding: '4px 8px',
            color: confirmRemove ? '#ff6b6b' : '#7c8db5', cursor: 'pointer',
            fontSize: confirmRemove ? 11 : 13, fontWeight: confirmRemove ? 600 : 400,
            transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
        >
          {confirmRemove ? '¿Seguro?' : '✕'}
        </button>
      )}

      {!isAdmin && allowSelfRemove && isSelf && (
        <button
          onClick={() => {
            if (confirmRemove) {
              if (confirmTimer.current) clearTimeout(confirmTimer.current);
              setConfirmRemove(false);
              onRemove?.();
            } else {
              setConfirmRemove(true);
              confirmTimer.current = setTimeout(() => setConfirmRemove(false), 3000);
            }
          }}
          style={{
            background: confirmRemove ? '#e031311a' : 'none',
            border: confirmRemove ? '1px solid #e0313155' : '1px solid #2a2f5a',
            borderRadius: 8, padding: '4px 10px',
            color: confirmRemove ? '#ff6b6b' : '#7c8db5', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
        >
          {confirmRemove ? '¿Seguro?' : 'Salirme'}
        </button>
      )}
    </div>
  );
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const [mainList, setMainList] = useState<GameRegistration[]>([]);
  const [waitList, setWaitList] = useState<GameRegistration[]>([]);

  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [selectedReg, setSelectedReg] = useState<GameRegistration | null>(null);
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

  const [completing, setCompleting] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const confirmCompleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useGameStream(id, fetchGame);

  const sensors = useSensors(
    useSensor(PointerSensor),
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
      const updatedMain = listType === 'main' ? newList : mainList;
      const updatedWait = listType === 'wait' ? newList : waitList;
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
    setRegSuccess('');
    setRegistering(true);
    try {
      await gamesService.register(id);
      setRegSuccess('¡Te anotaste correctamente!');
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

  async function handleRemove(userId: string) {
    if (!id) return;
    try {
      await gamesService.removeRegistration(id, userId);
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

  function handleCompleteClick() {
    if (!confirmComplete) {
      setConfirmComplete(true);
      if (confirmCompleteTimeout.current) clearTimeout(confirmCompleteTimeout.current);
      confirmCompleteTimeout.current = setTimeout(() => setConfirmComplete(false), 4000);
      return;
    }
    if (confirmCompleteTimeout.current) clearTimeout(confirmCompleteTimeout.current);
    setConfirmComplete(false);
    handleComplete();
  }

  async function handleComplete() {
    if (!id) return;
    setCompleting(true);
    try {
      await gamesService.complete(id);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setCompleting(false);
    }
  }

  async function handleCancel() {
    if (!id || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await gamesService.cancel(id, cancelReason);
      setShowCancel(false);
      fetchGame();
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setCancelling(false);
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
  const isAlreadyRegistered = mainList.some((r) => r.userId === user?.id) || waitList.some((r) => r.userId === user?.id);
  const spotsLeft = Math.max(0, game.maxMainSpots - mainList.length);

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
          isAdmin ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {(game.status === 'registration_open' || game.status === 'in_progress') && (
                <button
                  onClick={handleCompleteClick}
                  disabled={completing}
                  className="btn btn-primary"
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    minHeight: 34,
                    ...(confirmComplete ? { background: '#e03131', borderColor: '#e03131' } : {}),
                  }}
                >
                  {completing ? '...' : confirmComplete ? '¿Seguro? Terminar' : '✅ Terminar'}
                </button>
              )}
              {game.status !== 'completed' && game.status !== 'cancelled' && (
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

        {isAdmin && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8, marginBottom: 16,
          }}>
            {[
              { label: 'Anotados', value: `${mainList.length}/${game.maxMainSpots}` },
              { label: 'Asistieron', value: `${attended}` },
              { label: 'Pagaron', value: `${totalPaid}` },
              { label: 'Recaudado', value: `$${recaudado.toLocaleString('es-CO')}` },
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

        {isOpen && (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
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
                {regSuccess && <p style={{ color: '#2da44e', fontSize: 13, marginBottom: 8 }}>{regSuccess}</p>}
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

        {isAdmin ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'main')}>
            <SortableContext items={mainList.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {mainList.map((reg, i) => (
                <SortableRow
                  key={reg.id}
                  reg={reg}
                  index={i}
                  isAdmin={isAdmin}
                  onToggleAttended={() => handleToggle(reg.id, 'attended', reg.attended)}
                  onTogglePaid={() => handleToggle(reg.id, 'paid', reg.paid)}
                  onRemove={() => handleRemove(reg.userId)}
                  isSelf={reg.userId === user?.id}
                  allowSelfRemove={isOpen}
                  draggable={isAdmin}
                  onNameClick={() => setSelectedReg(reg)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          mainList.map((reg, i) => (
            <SortableRow
              key={reg.id}
              reg={reg}
              index={i}
              isAdmin={false}
              onRemove={() => handleRemove(reg.userId)}
              isSelf={reg.userId === user?.id}
              allowSelfRemove={isOpen}
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
            {isAdmin ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'wait')}>
                <SortableContext items={waitList.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {waitList.map((reg, i) => (
                    <SortableRow
                      key={reg.id}
                      reg={reg}
                      index={i}
                      isAdmin={isAdmin}
                      onToggleAttended={() => handleToggle(reg.id, 'attended', reg.attended)}
                      onTogglePaid={() => handleToggle(reg.id, 'paid', reg.paid)}
                      onPromote={() => handlePromote(reg.id)}
                      onRemove={() => handleRemove(reg.userId)}
                      isSelf={reg.userId === user?.id}
                      allowSelfRemove={isOpen}
                      draggable={isAdmin}
                      onNameClick={() => setSelectedReg(reg)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              waitList.map((reg, i) => (
                <SortableRow
                  key={reg.id}
                  reg={reg}
                  index={i}
                  isAdmin={false}
                  onRemove={() => handleRemove(reg.userId)}
                  isSelf={reg.userId === user?.id}
                  allowSelfRemove={isOpen}
                  draggable={false}
                  onNameClick={() => setSelectedReg(reg)}
                />
              ))
            )}
          </>
        )}

        {isAdmin && (
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
        )}
      </div>

      {/* Player profile modal */}
      {selectedReg && (() => {
        const u = selectedReg.user;
        const age = u.birthDate
          ? Math.floor((Date.now() - new Date(u.birthDate).getTime()) / 31557600000)
          : null;
        const genderLabel = u.gender === 'masculino' ? 'Masculino' : u.gender === 'femenino' ? 'Femenino' : u.gender === 'otro' ? 'Otro' : null;

        const infoItems: { label: string; value: string }[] = [];
        if (u.position) infoItems.push({ label: 'Posición', value: POSITION_LABELS[u.position] || u.position });
        if (u.heightCm) infoItems.push({ label: 'Estatura', value: `${u.heightCm} cm` });
        if (age !== null) infoItems.push({ label: 'Edad', value: `${age} años` });
        if (genderLabel) infoItems.push({ label: 'Género', value: genderLabel });
        infoItems.push({ label: 'Teléfono', value: u.phone });
        infoItems.push({
          label: 'En la lista',
          value: `#${selectedReg.position} ${selectedReg.isWaitingList ? '(Espera)' : '(Principal)'}`,
        });

        return (
          <div
            onClick={() => setSelectedReg(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 300, padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1a1d38', borderRadius: 16, width: '100%', maxWidth: 340,
                maxHeight: '85vh', overflow: 'auto', padding: 24,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div
                  onClick={() => u.photoUrl && setFullPhoto(resolvePhotoUrl(u.photoUrl))}
                  style={{ cursor: u.photoUrl ? 'pointer' : 'default' }}
                >
                  <Avatar name={u.name} photoUrl={u.photoUrl} size={88} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, margin: 0 }}>{u.name}</p>
                  <p style={{ color: '#7c8db5', fontSize: 13, margin: '4px 0 0' }}>@{u.username}</p>
                </div>
                {u.bio && (
                  <p style={{
                    color: '#a0aec0', fontSize: 13, margin: '4px 0 0',
                    fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5,
                    maxWidth: 280,
                  }}>
                    "{u.bio}"
                  </p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {infoItems.map((item) => (
                  <div key={item.label} style={{ background: '#141627', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ color: '#7c8db5', fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </p>
                    <p style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>
                      {item.value}
                    </p>
                  </div>
                ))}
                {selectedReg.fromWaitList && (
                  <div style={{ background: '#141627', borderRadius: 10, padding: '10px 14px', gridColumn: '1 / -1' }}>
                    <p style={{ color: '#e3a008', fontSize: 13, margin: 0 }}>↑ Promovido desde lista de espera</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedReg(null)}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13,
                  background: '#141627', border: '1px solid #2a2f5a',
                  color: '#7c8db5', cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        );
      })()}

      {/* Full photo viewer */}
      {fullPhoto && (
        <div
          onClick={() => setFullPhoto(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 500, cursor: 'pointer', padding: 24,
          }}
        >
          <img
            src={fullPhoto}
            alt="Foto"
            style={{
              maxWidth: '100%', maxHeight: '85vh', borderRadius: 12,
              objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}

      {showAudit && (
        <div
          style={{ position: 'fixed', inset: 0, background: '#000b', zIndex: 300, overflowY: 'auto' }}
          onClick={() => setShowAudit(false)}
        >
          <div
            style={{
              background: '#161829', margin: '40px auto', maxWidth: 640,
              borderRadius: 16, padding: 24, border: '1px solid #2a2f5a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#e8eaf6', margin: 0 }}>Registro de Actividad</h3>
              <button onClick={() => setShowAudit(false)} style={{ background: 'none', border: 'none', color: '#7c8db5', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {auditLogs.map((log) => (
              <div key={log.id} style={{ borderBottom: '1px solid #2a2f5a', paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#e8eaf6', fontSize: 13, fontWeight: 600 }}>{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                  <span style={{ color: '#7c8db5', fontSize: 11 }}>{new Date(log.createdAt).toLocaleString('es-CO')}</span>
                </div>
                <p style={{ color: '#7c8db5', fontSize: 12, margin: '4px 0 0' }}>
                  Por {log.actor.name}
                  {log.targetUser && ` → ${log.targetUser.name}`}
                </p>
              </div>
            ))}
            {auditLogs.length === 0 && <p style={{ color: '#7c8db5', textAlign: 'center' }}>Sin actividad registrada</p>}
          </div>
        </div>
      )}

      {showCancel && (
        <div
          style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
          onClick={() => setShowCancel(false)}
        >
          <div
            style={{ background: '#161829', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, border: '1px solid #2a2f5a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#e8eaf6', marginTop: 0, marginBottom: 16 }}>Cancelar Partido</h3>
            <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
              Razón de cancelación
            </label>
            <input
              className="zetas-input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="No hay suficientes jugadores, lluvia..."
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>Volver</button>
              <button
                className="btn"
                style={{ flex: 1, color: '#e03131', borderColor: '#e031312a' }}
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
