const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

interface FinanceSummaryProps {
  balance: number;
  totalExpenses: number;
  totalIncome: number;
  totalFinesPaid: number;
}

export function FinanceSummary({ balance, totalExpenses, totalIncome, totalFinesPaid }: FinanceSummaryProps) {
  return (
    <>
      <div className="card" style={{ padding: 24, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 4, letterSpacing: 1 }}>DINERO DISPONIBLE</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: balance >= 0 ? '#66bb6a' : '#ef5350' }}>
          {fmt(balance)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Gastos</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#ef5350' }}>{fmt(totalExpenses)}</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Entradas</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#66bb6a' }}>{fmt(totalIncome)}</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Multas Pagadas</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#42a5f5' }}>{fmt(totalFinesPaid)}</div>
        </div>
      </div>
    </>
  );
}
