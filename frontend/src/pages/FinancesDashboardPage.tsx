import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { FinanceSummary } from '../components/FinanceSummary';
import { financesService, type DashboardData, type FinanceTransaction } from '../services/finances.service';
import { getApiError } from '../services/api';

const PAGE_SIZE = 10;

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0' }}>
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page === 1} onClick={() => onPageChange(page - 1)}>← Anterior</button>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Pág. {page} de {totalPages}</span>
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Siguiente →</button>
    </div>
  );
}

export function FinancesDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [txSortCol, setTxSortCol] = useState<'date' | 'description' | 'amount'>('date');
  const [txSortDir, setTxSortDir] = useState<'asc' | 'desc'>('desc');
  const [txPage, setTxPage] = useState(1);

  const [fineSortCol, setFineSortCol] = useState<'name' | 'amount' | 'date'>('date');
  const [fineSortDir, setFineSortDir] = useState<'asc' | 'desc'>('asc');
  const [finePage, setFinePage] = useState(1);

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

  useEffect(() => { setTxPage(1); }, [txFilter, txSortCol, txSortDir]);
  useEffect(() => { setFinePage(1); }, [fineSortCol, fineSortDir]);

  const filteredTx = useMemo(() => {
    const base = txFilter === 'all' ? transactions : transactions.filter((t) => t.type === txFilter);
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (txSortCol) {
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'description': cmp = a.description.localeCompare(b.description); break;
      }
      return txSortDir === 'asc' ? cmp : -cmp;
    });
  }, [transactions, txFilter, txSortCol, txSortDir]);

  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / PAGE_SIZE));
  const paginatedTx = filteredTx.slice((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE);

  const sortedFines = useMemo(() => {
    if (!dashboard) return [];
    return [...dashboard.pendingFines].sort((a, b) => {
      let cmp = 0;
      switch (fineSortCol) {
        case 'name': cmp = a.userName.localeCompare(b.userName); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
      }
      return fineSortDir === 'asc' ? cmp : -cmp;
    });
  }, [dashboard, fineSortCol, fineSortDir]);

  const fineTotalPages = Math.max(1, Math.ceil(sortedFines.length / PAGE_SIZE));
  const paginatedFines = sortedFines.slice((finePage - 1) * PAGE_SIZE, finePage * PAGE_SIZE);

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-CO')}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  const handleTxSort = (col: typeof txSortCol) => {
    if (txSortCol === col) setTxSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setTxSortCol(col); setTxSortDir(col === 'date' ? 'desc' : 'asc'); }
  };

  const handleFineSort = (col: typeof fineSortCol) => {
    if (fineSortCol === col) setFineSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setFineSortCol(col); setFineSortDir(col === 'date' ? 'asc' : 'asc'); }
  };

  const sortIcon = (active: boolean, dir: 'asc' | 'desc') => active ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const thStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 12px', cursor: 'pointer', userSelect: 'none',
    color: active ? '#6e8efb' : undefined,
  });

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
          <select className="zetas-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Summary */}
        {dashboard && (
          <FinanceSummary
            balance={dashboard.balance}
            totalExpenses={dashboard.totalExpenses}
            totalIncome={dashboard.totalIncome}
            totalFinesPaid={dashboard.totalFinesPaid}
          />
        )}

        {/* Pending fines section */}
        {dashboard && sortedFines.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Multados / Deudores</h3>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{sortedFines.length} registro(s)</span>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ ...thStyle(fineSortCol === 'name'), textAlign: 'left' }} onClick={() => handleFineSort('name')}>Nombre{sortIcon(fineSortCol === 'name', fineSortDir)}</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Motivo</th>
                    <th style={{ ...thStyle(fineSortCol === 'amount'), textAlign: 'right' }} onClick={() => handleFineSort('amount')}>Monto{sortIcon(fineSortCol === 'amount', fineSortDir)}</th>
                    <th style={{ ...thStyle(fineSortCol === 'date'), textAlign: 'right' }} onClick={() => handleFineSort('date')}>Fecha{sortIcon(fineSortCol === 'date', fineSortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedFines.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px' }}>{f.userName}</td>
                      <td style={{ padding: '8px 12px', opacity: 0.7 }}>{f.reason}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef5350' }}>{formatCurrency(f.amount)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', opacity: 0.7 }}>{formatDate(f.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={finePage} totalPages={fineTotalPages} onPageChange={setFinePage} />
            </div>
          </div>
        )}

        {/* Transactions table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Movimientos</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
              <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 8 }}>{filteredTx.length} registro(s)</span>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filteredTx.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay movimientos para este período</div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ ...thStyle(txSortCol === 'date'), textAlign: 'left' }} onClick={() => handleTxSort('date')}>Fecha{sortIcon(txSortCol === 'date', txSortDir)}</th>
                      <th style={{ ...thStyle(txSortCol === 'description'), textAlign: 'left' }} onClick={() => handleTxSort('description')}>Descripción{sortIcon(txSortCol === 'description', txSortDir)}</th>
                      <th style={{ ...thStyle(txSortCol === 'amount'), textAlign: 'right' }} onClick={() => handleTxSort('amount')}>Monto{sortIcon(txSortCol === 'amount', txSortDir)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTx.map((tx) => (
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
                <Pagination page={txPage} totalPages={txTotalPages} onPageChange={setTxPage} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
