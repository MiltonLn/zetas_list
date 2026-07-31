import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateGamePayload } from '../services/games.service';
import type { Modalidad } from '../types';
import { MODALIDAD_LABELS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { getApiError } from '../services/api';
import { useCreateGameMutation } from '../hooks/useGameQuery';

const MODALIDAD_SPOTS: Record<Modalidad, number> = {
  seis_x_seis: 18,
  cuatro_x_cuatro: 12,
};

function buildAutoTitle(modalidad: Modalidad, gameDate: string, startTime: string) {
  if (!gameDate) return `Volley Ingenio ${MODALIDAD_LABELS[modalidad]} DD/MM/AAAA ${startTime}pm`;
  const date = new Date(gameDate + 'T00:00:00');
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `Volley Ingenio ${MODALIDAD_LABELS[modalidad]} ${day}/${month}/${year} ${startTime}pm`;
}

export default function CreateGamePage() {
  const navigate = useNavigate();
  const [modalidad, setModalidad] = useState<Modalidad>('seis_x_seis');
  const [gameDate, setGameDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [startTime, setStartTime] = useState('18:50');
  const [registrationOpenTime, setRegistrationOpenTime] = useState('10:00');
  const [pricePerPlayer, setPricePerPlayer] = useState('2000');
  const [vigilante, setVigilante] = useState('10000');
  const [maxMainSpots, setMaxMainSpots] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const [guestCutoffTime, setGuestCutoffTime] = useState('13:30');
  const [maxProxyRegistrations, setMaxProxyRegistrations] = useState('1');
  const [error, setError] = useState('');
  const createGame = useCreateGameMutation();

  const autoTitle = buildAutoTitle(modalidad, gameDate, startTime);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload: CreateGamePayload = {
        modalidad,
        gameDate,
        startTime,
        registrationOpenTime,
        pricePerPlayer: pricePerPlayer ? parseInt(pricePerPlayer) : undefined,
        vigilante: vigilante ? parseInt(vigilante) : undefined,
        maxMainSpots: maxMainSpots ? parseInt(maxMainSpots) : undefined,
        customTitle: useCustomTitle && customTitle.trim() ? customTitle.trim() : undefined,
        guestCutoffTime: guestCutoffTime || undefined,
        maxProxyRegistrations: maxProxyRegistrations ? parseInt(maxProxyRegistrations) : undefined,
      };
      const game = await createGame.mutateAsync(payload);
      navigate(`/game/${game.id}`);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <>
      <PageHeader title="Crear Nuevo Partido" backTo="/" />

      <div className="page-wrapper" style={{ maxWidth: 560 }}>
        <div className="card create-game-card">
          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>

            {/* Modalidad */}
            <div>
              <label className="field-label">Modalidad</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(Object.keys(MODALIDAD_LABELS) as Modalidad[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalidad(m)}
                    style={{
                      flex: 1,
                      padding: '12px 4px',
                      borderRadius: 10,
                      border: modalidad === m ? '2px solid #3b5bdb' : '2px solid #2a2f5a',
                      background: modalidad === m ? '#3b5bdb22' : '#1a1d38',
                      color: modalidad === m ? '#6e8efb' : '#7c8db5',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 15,
                      transition: 'all 0.15s',
                    }}
                  >
                    {MODALIDAD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha + Hora inicio */}
            <div className="form-grid-2">
              <div>
                <label className="field-label">Fecha del partido</label>
                <input
                  className="zetas-input"
                  type="date"
                  value={gameDate}
                  onChange={(e) => setGameDate(e.target.value)}
                  min={today}
                  required
                />
              </div>
              <div>
                <label className="field-label">Hora de inicio</label>
                <input
                  className="zetas-input"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Apertura del registro */}
            <div>
              <label className="field-label">Hora de apertura del registro</label>
              <input
                className="zetas-input"
                type="time"
                value={registrationOpenTime}
                onChange={(e) => setRegistrationOpenTime(e.target.value)}
                required
              />
              <p className="field-hint">
                El registro se abre el mismo día del partido a esta hora (Colombia).
                En este momento se envía automáticamente el mensaje a WhatsApp.
              </p>
            </div>

            {/* Precio · Vigilante · Cupos */}
            <div className="form-grid-3">
              <div>
                <label className="field-label">Precio jugador</label>
                <input
                  className="zetas-input"
                  type="number"
                  min={0}
                  step={100}
                  value={pricePerPlayer}
                  onChange={(e) => setPricePerPlayer(e.target.value)}
                  placeholder="2000"
                />
              </div>
              <div>
                <label className="field-label">Vigilante</label>
                <input
                  className="zetas-input"
                  type="number"
                  min={0}
                  step={1000}
                  value={vigilante}
                  onChange={(e) => setVigilante(e.target.value)}
                  placeholder="10000"
                />
              </div>
              <div>
                <label className="field-label">Cupos</label>
                <input
                  className="zetas-input"
                  type="number"
                  min={2}
                  value={maxMainSpots}
                  onChange={(e) => setMaxMainSpots(e.target.value)}
                  placeholder={MODALIDAD_SPOTS[modalidad].toString()}
                />
              </div>
            </div>

            {/* Corte invitados · Máx. anotaciones */}
            <div className="form-grid-2">
              <div>
                <label className="field-label">Corte invitados</label>
                <input
                  className="zetas-input"
                  type="time"
                  value={guestCutoffTime}
                  onChange={(e) => setGuestCutoffTime(e.target.value)}
                />
                <p className="field-hint">Antes de esta hora, invitados siempre van a lista de espera.</p>
              </div>
              <div>
                <label className="field-label">Máx. anotaciones</label>
                <input
                  className="zetas-input"
                  type="number"
                  min={0}
                  max={10}
                  value={maxProxyRegistrations}
                  onChange={(e) => setMaxProxyRegistrations(e.target.value)}
                  placeholder="1"
                />
                <p className="field-hint">Cuántas personas puede anotar un miembro (sin contarse a sí mismo).</p>
              </div>
            </div>

            {/* Título */}
            <div
              style={{
                background: '#3b5bdb11',
                border: '1px solid #3b5bdb33',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: useCustomTitle ? 10 : 0 }}>
                <p style={{ color: '#6e8efb', fontSize: 13, margin: 0, wordBreak: 'break-word', flex: 1 }}>
                  📋 <strong>{useCustomTitle && customTitle.trim() ? customTitle.trim() : autoTitle}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomTitle(!useCustomTitle);
                    if (!useCustomTitle) setCustomTitle('');
                  }}
                  style={{
                    background: 'none', border: 'none', color: '#6e8efb',
                    cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                    padding: 0, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {useCustomTitle ? 'Usar automático' : 'Personalizar'}
                </button>
              </div>
              {useCustomTitle && (
                <input
                  className="zetas-input"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={autoTitle}
                />
              )}
            </div>

            {error && (
              <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{error}</p>
            )}

            <button type="submit" className="btn btn-primary" disabled={createGame.isPending}>
              {createGame.isPending ? 'Creando partido...' : 'Crear partido'}
            </button>

          </form>
        </div>
      </div>
    </>
  );
}
