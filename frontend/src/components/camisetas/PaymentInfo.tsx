import { formatCurrency } from '../../utils/currency';
import { BRE_B_KEY, PAYMENT_CONTACT } from './shared';

export function PaymentInfo({ deposit, pending }: { deposit: number; pending: number }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 8,
        background: 'rgba(110,142,251,0.1)',
        border: '1px solid rgba(110,142,251,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#c5cae9', fontSize: 13 }}>Abono ahora (50%)</span>
        <span style={{ color: '#6e8efb', fontSize: 14, fontWeight: 700 }}>{formatCurrency(deposit)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#c5cae9', fontSize: 13 }}>Saldo pendiente</span>
        <span style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600 }}>{formatCurrency(pending)}</span>
      </div>
      <p style={{ color: '#7c8db5', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Para confirmar tu pedido abona el 50% (<strong style={{ color: '#c5cae9' }}>{formatCurrency(deposit)}</strong>)
        a la llave Bre-b <strong style={{ color: '#6e8efb' }}>{BRE_B_KEY}</strong> y envía el
        comprobante por WhatsApp al <strong style={{ color: '#c5cae9' }}>{PAYMENT_CONTACT}</strong>.
        El saldo restante se cancela en la entrega. Plazo para abonos: 1 de Julio de 2026
      </p>
    </div>
  );
}
