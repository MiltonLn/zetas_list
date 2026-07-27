import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { FinanceSummary } from '../components/FinanceSummary';
import { Spinner } from '../components/Spinner';
import { financesService, type FinanceTransaction, type Fine } from '../services/finances.service';
import { TransactionsTable } from '../components/finances/TransactionsTable';
import { FinesTable } from '../components/finances/FinesTable';
import { TransactionModal } from '../components/finances/TransactionModal';
import { FineModal } from '../components/finances/FineModal';
import { ImportModal } from '../components/finances/ImportModal';


import { usersService } from '../services/users.service';
import { getApiError } from '../services/api';
import { showToast } from '../utils/toast';
import type { User } from '../types';

type Tab = 'transactions' | 'fines';

export function AdminFinancesPage() {
  const [tab, setTab] = useState<Tab>('transactions');
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const [showTxModal, setShowTxModal] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [showFineModal, setShowFineModal] = useState(false);
  const [editingFine, setEditingFine] = useState<Fine | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, finesRes] = await Promise.all([
        financesService.getTransactions(year),
        financesService.getFines(year),
      ]);
      setTransactions(txRes.data);
      setFines(finesRes.data);
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [year]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersService.list();
      setUsers(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-CO')}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  const handleDeleteTx = async (id: string) => {
    if (!confirm('¿Eliminar esta transacción?')) return;
    try {
      await financesService.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      showToast('Transacción eliminada', 'success');
    } catch (e) { showToast(getApiError(e), 'error'); }
  };

  const handleDeleteFine = async (id: string) => {
    if (!confirm('¿Eliminar esta multa?')) return;
    try {
      await financesService.deleteFine(id);
      setFines((prev) => prev.filter((f) => f.id !== id));
      showToast('Multa eliminada', 'success');
    } catch (e) { showToast(getApiError(e), 'error'); }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const res = await financesService.updateFine(id, { status: 'paid' });
      setFines((prev) => prev.map((f) => f.id === id ? res.data : f));
      showToast('Multa marcada como pagada', 'success');
    } catch (e) { showToast(getApiError(e), 'error'); }
  };

  const summary = useMemo(() => {
    const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalFinesPaid = fines.filter((f) => f.status === 'paid').reduce((s, f) => s + f.amount, 0);
    return { totalIncome, totalExpenses, totalFinesPaid, balance: totalIncome - totalExpenses };
  }, [transactions, fines]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Gestionar Finanzas"
        subtitle={`Año ${year}`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>Importar</button>
          </div>
        }
      />
      <div className="page-wrapper" style={{ maxWidth: 1000 }}>
        {/* Year + Tabs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="zetas-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn ${tab === 'transactions' ? 'btn-primary' : ''}`} onClick={() => setTab('transactions')}>Transacciones</button>
            <button className={`btn ${tab === 'fines' ? 'btn-primary' : ''}`} onClick={() => setTab('fines')}>Multas y Deudas</button>
          </div>
        </div>

        <FinanceSummary {...summary} />

        {tab === 'transactions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-success" onClick={() => { setEditingTx(null); setShowTxModal(true); }}>+ Nueva Transacción</button>
            </div>
            <TransactionsTable
              transactions={transactions}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onEdit={(tx) => { setEditingTx(tx); setShowTxModal(true); }}
              onDelete={handleDeleteTx}
            />
          </>
        )}

        {tab === 'fines' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-success" onClick={() => { setEditingFine(null); setShowFineModal(true); }}>+ Nueva Multa</button>
            </div>
            <FinesTable
              fines={fines}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onEdit={(f) => { setEditingFine(f); setShowFineModal(true); }}
              onDelete={handleDeleteFine}
              onMarkPaid={handleMarkPaid}
            />
          </>
        )}
      </div>

      {showTxModal && (
        <TransactionModal
          transaction={editingTx}
          onClose={() => setShowTxModal(false)}
          onSaved={() => { setShowTxModal(false); loadData(); }}
        />
      )}

      {showFineModal && (
        <FineModal
          fine={editingFine}
          users={users}
          onClose={() => setShowFineModal(false)}
          onSaved={() => { setShowFineModal(false); loadData(); }}
        />
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => { setShowImportModal(false); loadData(); }}
        />
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

