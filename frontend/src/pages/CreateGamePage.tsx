import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesService, CreateGamePayload } from '../services/games.service';
import { Modalidad, MODALIDAD_LABELS } from '../types';
import { Header } from '../components/Header';
import { getApiError } from '../services/api';

const MODALIDAD_SPOTS: Record<Modalidad, number> = {
  seis_x_seis: 18,
  cuatro_x_cuatro: 12,
  torneo: 18,
};

function toLocalDateTimeString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateGamePage() {
  const navigate = useNavigate();
  const [modalidad, setModalidad] = useState<Modalidad>('seis_x_seis');
  const [gameDate, setGameDate] = useState('');
  const [startTime, setStartTime] = useState('19:50');
  const [registrationOpenAt, setRegistrationOpenAt] = useState('');
  const [pricePerPlayer, setPricePerPlayer] = useState('2000');
  const [maxMainSpots, setMaxMainSpots] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleModalidadChange(m: Modalidad) {
    setModalidad(m);
    if (!maxMainSpots) {
      // auto-fill will happen via placeholder
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: CreateGamePayload = {
        modalidad,
        gameDate,
        startTime,
        registrationOpenAt: new Date(registrationOpenAt).toISOString(),
        pricePerPlayer: pricePerPlayer ? parseInt(pricePerPlayer) : undefined,
        maxMainSpots: maxMainSpots ? parseInt(maxMainSpots) : undefined,
      };
      const { data } = await gamesService.create(payload);
      navigate(`/game/${data.id}`);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  return (
    <div style={{ minHeight: '100vh', background: '#0f1020' }}>
      <Header title="Crear Nuevo Partido" backTo="/" />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{ background: '#161829', border: '1px solid #2a2f5a', borderRadius: 14, padding: 24 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                Modalidad
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(Object.keys(MODALIDAD_LABELS) as Modalidad[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleModalidadChange(m)}
                    style={{
                      flex: 1,
                      padding: '10px 4px',
                      borderRadius: 10,
                      border: modalidad === m ? '2px solid #3b5bdb' : '2px solid #2a2f5a',
                      background: modalidad === m ? '#3b5bdb22' : '#1a1d38',
                      color: modalidad === m ? '#6e8efb' : '#7c8db5',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'all 0.15s',
                    }}
                  >
                    {MODALIDAD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Fecha del partido
                </label>
                <input
                  className="zetas-input"
                  type="date"
                  value={gameDate}
                  onChange={(e) => setGameDate(e.target.value)}
                  min={defaultDate}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Hora de inicio
                </label>
                <input
                  className="zetas-input"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                Abrir registro el
              </label>
              <input
                className="zetas-input"
                type="datetime-local"
                value={registrationOpenAt}
                onChange={(e) => setRegistrationOpenAt(e.target.value)}
                required
              />
              <p style={{ color: '#7c8db5', fontSize: 12, marginTop: 4 }}>
                En este momento se envía automáticamente el mensaje a WhatsApp
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Precio por jugador ($)
                </label>
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
                <label style={{ display: 'block', color: '#7c8db5', fontSize: 13, marginBottom: 6 }}>
                  Cupos (opcional)
                </label>
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

            <div
              style={{
                background: '#3b5bdb11',
                border: '1px solid #3b5bdb33',
                borderRadius: 10,
                padding: '12px 16px',
              }}
            >
              <p style={{ color: '#6e8efb', fontSize: 13, margin: 0 }}>
                📋 Título generado: <strong>Volley Ingenio {MODALIDAD_LABELS[modalidad]} {gameDate || 'DD/MM/AAAA'} {startTime}pm</strong>
              </p>
            </div>

            {error && (
              <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{error}</p>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Creando partido...' : 'Crear partido'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
