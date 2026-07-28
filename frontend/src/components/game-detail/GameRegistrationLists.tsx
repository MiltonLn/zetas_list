import {
  closestCenter,
  DndContext,
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
} from '@dnd-kit/sortable';
import type { GameRegistration } from '../../types';
import { SortableRegistrationRow } from '../SortableRegistrationRow';

type ListType = 'main' | 'wait';

interface GameRegistrationListsProps {
  mainList: GameRegistration[];
  waitList: GameRegistration[];
  maxMainSpots: number;
  currentUserId?: string;
  isGameManager: boolean;
  isFinished: boolean;
  isOpen: boolean;
  onDragEnd: (event: DragEndEvent, listType: ListType) => void;
  onToggle: (regId: string, field: 'attended' | 'paid', currentValue: boolean) => void;
  onPromote: (regId: string) => void;
  onDemote: (regId: string) => void;
  onConfirm: (regId: string) => void;
  onRemove: (userId: string | null, regId?: string) => void;
  onSelect: (registration: GameRegistration) => void;
}

export function GameRegistrationLists(props: GameRegistrationListsProps) {
  const {
    mainList,
    waitList,
    maxMainSpots,
    onDragEnd,
  } = props;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <>
      <ListTitle title="Lista Principal" count={`${mainList.length}/${maxMainSpots}`} />
      <RegistrationList
        {...props}
        registrations={mainList}
        listType="main"
        sensors={sensors}
        mainListFull={mainList.length >= maxMainSpots}
        onDragEnd={onDragEnd}
      />
      {mainList.length === 0 && (
        <p style={{ color: '#7c8db5', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Sin anotados aún
        </p>
      )}

      {waitList.length > 0 && (
        <>
          <div style={{ marginTop: 24 }}>
            <ListTitle title="Lista de Espera" count={String(waitList.length)} />
          </div>
          <RegistrationList
            {...props}
            registrations={waitList}
            listType="wait"
            sensors={sensors}
            mainListFull={mainList.length >= maxMainSpots}
            onDragEnd={onDragEnd}
          />
        </>
      )}
    </>
  );
}

interface ListTitleProps {
  title: string;
  count: string;
}

function ListTitle({ title, count }: ListTitleProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <h2 style={{ color: '#e8eaf6', fontSize: 15, fontWeight: 700, margin: 0 }}>
        {title}
        <span style={{ marginLeft: 8, background: '#2a2f5a', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#7c8db5' }}>
          {count}
        </span>
      </h2>
    </div>
  );
}

interface RegistrationListProps extends Omit<GameRegistrationListsProps, 'mainList' | 'waitList' | 'maxMainSpots'> {
  registrations: GameRegistration[];
  listType: ListType;
  sensors: ReturnType<typeof useSensors>;
  mainListFull: boolean;
}

function RegistrationList({
  registrations,
  listType,
  sensors,
  currentUserId,
  isGameManager,
  isFinished,
  isOpen,
  mainListFull,
  onDragEnd,
  onToggle,
  onPromote,
  onDemote,
  onConfirm,
  onRemove,
  onSelect,
}: RegistrationListProps) {
  const rows = registrations.map((registration, index) => (
    <SortableRegistrationRow
      key={registration.id}
      reg={registration}
      index={index}
      isGameManager={isGameManager}
      readonly={isFinished}
      mainListFull={mainListFull}
      onToggleAttended={() => onToggle(registration.id, 'attended', registration.attended)}
      onTogglePaid={() => onToggle(registration.id, 'paid', registration.paid)}
      onPromote={() => onPromote(registration.id)}
      onDemote={() => onDemote(registration.id)}
      onConfirm={() => onConfirm(registration.id)}
      onRemove={() => onRemove(registration.userId, registration.isGuest ? registration.id : undefined)}
      isSelf={registration.userId === currentUserId}
      allowSelfRemove={isOpen}
      isOwnGuest={!isGameManager && registration.isGuest && registration.registeredById === currentUserId}
      draggable={isGameManager && !isFinished}
      onNameClick={() => onSelect(registration)}
    />
  ));

  if (!isGameManager) return rows;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => onDragEnd(event, listType)}>
      <SortableContext items={registrations.map((registration) => registration.id)} strategy={verticalListSortingStrategy}>
        {rows}
      </SortableContext>
    </DndContext>
  );
}
