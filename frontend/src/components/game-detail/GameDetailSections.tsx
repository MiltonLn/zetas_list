import { Spinner } from '../Spinner';
import { formatCurrency } from '../../utils/currency';
import { formatReportLine } from '../../utils/format-report';

interface GameSummaryProps {
  mainCount: number;
  maxMainSpots: number;
  attended: number;
  paid: number;
  collected: number;
}

export function GameSummary({
  mainCount,
  maxMainSpots,
  attended,
  paid,
  collected,
}: GameSummaryProps) {
  const items = [
    { label: 'Anotados', value: `${mainCount}/${maxMainSpots}` },
    { label: 'Asistieron', value: String(attended) },
    { label: 'Pagaron', value: String(paid) },
    { label: 'Recaudado', value: formatCurrency(collected) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ background: '#161829', border: '1px solid #2a2f5a', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ color: '#e8eaf6', fontWeight: 700, fontSize: 16 }}>{value}</div>
          <div style={{ color: '#7c8db5', fontSize: 11 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

interface CompletionReportProps {
  report: string | null;
  loading: boolean;
}

export function CompletionReport({ report, loading }: CompletionReportProps) {
  return (
    <div style={{ background: '#0f1020', borderRadius: 12, padding: 16, border: '1px solid #2a2f5a', marginBottom: 20 }}>
      <h3 style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
        📋 Reporte del partido
      </h3>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <Spinner size={24} />
        </div>
      ) : report ? (
        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#e8eaf6' }}>
          {report.split('\n').map((line, index) => (
            <div
              key={`${index}-${line}`}
              style={{ minHeight: line.trim() === '' ? 8 : undefined }}
              dangerouslySetInnerHTML={{ __html: formatReportLine(line) || '&nbsp;' }}
            />
          ))}
        </div>
      ) : (
        <p style={{ color: '#7c8db5', fontSize: 13 }}>No se pudo cargar el reporte</p>
      )}
    </div>
  );
}

interface RegistrationActionsProps {
  hasPendingConfirmation: boolean;
  isAlreadyRegistered: boolean;
  spotsLeft: number;
  registrationError: string;
  registering: boolean;
  onConfirm: () => void;
  onRemoveSelf: () => void;
  onRegister: () => void;
  onRegisterOther: () => void;
}

export function RegistrationActions({
  hasPendingConfirmation,
  isAlreadyRegistered,
  spotsLeft,
  registrationError,
  registering,
  onConfirm,
  onRemoveSelf,
  onRegister,
  onRegisterOther,
}: RegistrationActionsProps) {
  return (
    <div style={{ marginBottom: 20, textAlign: 'center' }}>
      {hasPendingConfirmation && (
        <div style={{ background: '#f59f0011', border: '1px solid #f59f0033', borderRadius: 14, padding: '14px 20px', marginBottom: 12 }}>
          <p style={{ color: '#f59f00', fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>
            ⏳ Tienes una confirmación pendiente
          </p>
          <button onClick={onConfirm} style={{ background: '#2da44e', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            Confirmar asistencia
          </button>
        </div>
      )}
      {isAlreadyRegistered ? (
        <div style={{ background: '#2da44e11', border: '1px solid #2da44e33', borderRadius: 14, padding: '16px 20px' }}>
          <p style={{ color: '#2da44e', fontWeight: 700, fontSize: 16, margin: 0 }}>✅ Ya estás anotado</p>
          <button onClick={onRemoveSelf} style={{ background: 'none', border: '1px solid #2a2f5a', borderRadius: 8, padding: '6px 14px', color: '#7c8db5', cursor: 'pointer', fontSize: 12, marginTop: 10 }}>
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
          {registrationError && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8 }}>{registrationError}</p>}
          <button
            onClick={onRegister}
            disabled={registering}
            style={{ background: '#3b5bdb', border: 'none', borderRadius: 14, padding: '14px 32px', color: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, width: '100%', maxWidth: 300, opacity: registering ? 0.7 : 1, boxShadow: '0 4px 20px #3b5bdb44' }}
          >
            {registering ? 'Anotando...' : '🏐 ¡Anotame!'}
          </button>
        </div>
      )}
      <button onClick={onRegisterOther} style={{ background: 'none', border: '1px solid #3b5bdb55', borderRadius: 10, padding: '10px 20px', color: '#6e8efb', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 12, transition: 'all 0.15s' }}>
        + Anotar a alguien más
      </button>
    </div>
  );
}
