import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { financesService, type DashboardData, type FinanceTransaction } from '../services/finances.service';
import { getApiError } from '../services/api';

export function FinancesDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, txRes] = await Promise.all([
        financesService.getDashboard(year),
        financesService.getTransactions(year),
      ]);
      setDashboard(dashRes.data);
      setTransactions(txRes.data);
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter((t) => t.type === txFilter);

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-CO')}`;

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <Spinner />;

  if (error) {
    return (
      <>
        <PageHeader title="Finanzas" />
        <div className="page-wrapper" style={{ maxWidth: 900 }}>
          <div className="card" style={{ padding: 20, textAlign: 'center', color: '#ef5350' }}>{error}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Presupuesto Zetas ${year}`} subtitle="Estado financiero del grupo" />
      <div className="page-wrapper" style={{ maxWidth: 900 }}>
        {/* Year selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <label style={{ fontSize: 14, opacity: 0.7 }}>Año:</label>
          <select
            className="zetas-input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 100 }}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Balance card */}
        {dashboard && (
          <div className="card" style={{ padding: 24, marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>DINERO DISPONIBLE</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: dashboard.balance >= 0 ? '#66bb6a' : '#ef5350' }}>
              {formatCurrency(dashboard.balance)}
            </div>
          </div>
        )}

        {/* Summary row */}
        {dashboard && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Gastos</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#ef5350' }}>{formatCurrency(dashboard.totalExpenses)}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Entradas</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#66bb6a' }}>{formatCurrency(dashboard.totalIncome)}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Multas Pagadas</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#42a5f5' }}>{formatCurrency(dashboard.totalFinesPaid)}</div>
            </div>
          </div>
        )}

        {/* Pending fines section */}
        {dashboard && dashboard.pendingFines.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Multados / Deudores</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nombre</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Motivo</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.pendingFines.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px' }}>{f.userName}</td>
                      <td style={{ padding: '8px 12px', opacity: 0.7 }}>{f.reason}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef5350' }}>{formatCurrency(f.amount)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', opacity: 0.7 }}>{formatDate(f.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Movimientos</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'income', 'expense'] as const).map((f) => (
                <button
                  key={f}
                  className={`btn ${txFilter === f ? 'btn-primary' : ''}`}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setTxFilter(f)}
                >
                  {f === 'all' ? 'Todos' : f === 'income' ? 'Entradas' : 'Gastos'}
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filteredTransactions.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay movimientos para este período</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Fecha</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Descripción</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatDate(tx.date)}</td>
                      <td style={{ padding: '8px 12px' }}>{tx.description}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: tx.type === 'income' ? '#66bb6a' : '#ef5350', fontWeight: 500 }}>
                        {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
