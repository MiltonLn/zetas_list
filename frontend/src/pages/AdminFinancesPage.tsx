import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Modal } from '../components/Modal';
import { financesService, type FinanceTransaction, type Fine } from '../services/finances.service';

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

function TransactionsTable({ transactions, formatCurrency, formatDate, onEdit, onDelete }: {
  transactions: FinanceTransaction[];
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  onEdit: (tx: FinanceTransaction) => void;
  onDelete: (id: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [sortCol, setSortCol] = useState<'date' | 'amount' | 'description' | 'type'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const filtered = typeFilter === 'all' ? transactions : transactions.filter((t) => t.type === typeFilter);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
      case 'amount': cmp = a.amount - b.amount; break;
      case 'description': cmp = a.description.localeCompare(b.description); break;
      case 'type': cmp = a.type.localeCompare(b.type); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortIcon = (col: typeof sortCol) => {
    if (sortCol !== col) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const thStyle = (col: typeof sortCol, align: string = 'left'): React.CSSProperties => ({
    padding: '10px 12px', textAlign: align as 'left' | 'right' | 'center', cursor: 'pointer', userSelect: 'none',
    color: sortCol === col ? '#6e8efb' : undefined,
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'income', 'expense'] as const).map((f) => (
          <button
            key={f}
            className={`btn ${typeFilter === f ? 'btn-primary' : ''}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => { setTypeFilter(f); setPage(1); }}
          >
            {f === 'all' ? 'Todos' : f === 'income' ? 'Entradas' : 'Gastos'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.5 }}>{sorted.length} registro(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay transacciones</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={thStyle('date')} onClick={() => handleSort('date')}>Fecha{sortIcon('date')}</th>
                <th style={thStyle('type')} onClick={() => handleSort('type')}>Tipo{sortIcon('type')}</th>
                <th style={thStyle('description')} onClick={() => handleSort('description')}>Descripción{sortIcon('description')}</th>
                <th style={thStyle('amount', 'right')} onClick={() => handleSort('amount')}>Monto{sortIcon('amount')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatDate(tx.date)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: tx.type === 'income' ? 'rgba(102,187,106,0.2)' : 'rgba(239,83,80,0.2)', color: tx.type === 'income' ? '#66bb6a' : '#ef5350' }}>
                      {tx.type === 'income' ? 'Entrada' : 'Gasto'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{tx.description}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(tx.amount)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <button className="btn" style={{ fontSize: 11, padding: '2px 8px', marginRight: 4 }} onClick={() => onEdit(tx)}>Editar</button>
                    <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: '#ef5350' }} onClick={() => onDelete(tx.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

function FinesTable({ fines, formatCurrency, formatDate, onEdit, onDelete, onMarkPaid }: {
  fines: Fine[];
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  onEdit: (f: Fine) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [sortCol, setSortCol] = useState<'date' | 'amount' | 'name' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const filtered = statusFilter === 'all' ? fines : fines.filter((f) => f.status === statusFilter);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
      case 'amount': cmp = a.amount - b.amount; break;
      case 'name': cmp = (a.user?.name || '').localeCompare(b.user?.name || ''); break;
      case 'status': cmp = a.status.localeCompare(b.status); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortIcon = (col: typeof sortCol) => {
    if (sortCol !== col) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const thStyle = (col: typeof sortCol, align: string = 'left'): React.CSSProperties => ({
    padding: '10px 12px', textAlign: align as 'left' | 'right' | 'center', cursor: 'pointer', userSelect: 'none',
    color: sortCol === col ? '#6e8efb' : undefined,
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'pending', 'paid'] as const).map((f) => (
          <button
            key={f}
            className={`btn ${statusFilter === f ? 'btn-primary' : ''}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => { setStatusFilter(f); setPage(1); }}
          >
            {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : 'Pagados'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.5 }}>{sorted.length} registro(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay multas o deudas</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={thStyle('date')} onClick={() => handleSort('date')}>Fecha{sortIcon('date')}</th>
                <th style={thStyle('name')} onClick={() => handleSort('name')}>Nombre{sortIcon('name')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Motivo</th>
                <th style={thStyle('amount', 'right')} onClick={() => handleSort('amount')}>Monto{sortIcon('amount')}</th>
                <th style={thStyle('status', 'center')} onClick={() => handleSort('status')}>Estado{sortIcon('status')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatDate(f.date)}</td>
                  <td style={{ padding: '8px 12px' }}>{f.user?.name || 'N/A'}</td>
                  <td style={{ padding: '8px 12px', opacity: 0.7 }}>{f.reason}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(f.amount)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: f.status === 'paid' ? 'rgba(102,187,106,0.2)' : 'rgba(255,167,38,0.2)', color: f.status === 'paid' ? '#66bb6a' : '#ffa726' }}>
                      {f.status === 'paid' ? 'PAGADO' : 'DEBE'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {f.status === 'pending' && (
                      <button className="btn btn-success" style={{ fontSize: 11, padding: '2px 8px', marginRight: 4 }} onClick={() => onMarkPaid(f.id)}>Pagar</button>
                    )}
                    <button className="btn" style={{ fontSize: 11, padding: '2px 8px', marginRight: 4 }} onClick={() => onEdit(f)}>Editar</button>
                    <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: '#ef5350' }} onClick={() => onDelete(f.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

function TransactionModal({ transaction, onClose, onSaved }: {
  transaction: FinanceTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'income' | 'expense'>(transaction?.type || 'expense');
  const [date, setDate] = useState(transaction?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(String(transaction?.amount || ''));
  const [description, setDescription] = useState(transaction?.description || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (transaction) {
        await financesService.updateTransaction(transaction.id, { type, date, amount: Number(amount), description });
      } else {
        await financesService.createTransaction({ type, date, amount: Number(amount), description });
      }
      showToast(transaction ? 'Transacción actualizada' : 'Transacción creada', 'success');
      onSaved();
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={transaction ? 'Editar Transacción' : 'Nueva Transacción'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Tipo</label>
          <select className="zetas-input" value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
            <option value="expense">Gasto</option>
            <option value="income">Entrada</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Fecha</label>
          <input className="zetas-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Monto (COP)</label>
          <input className="zetas-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Descripción</label>
          <input className="zetas-input" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FineModal({ fine, users, onClose, onSaved }: {
  fine: Fine | null;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(fine?.userId || '');
  const [userSearch, setUserSearch] = useState('');
  const [date, setDate] = useState(fine?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(String(fine?.amount || ''));
  const [reason, setReason] = useState(fine?.reason || '');
  const [status, setStatus] = useState<'pending' | 'paid'>(fine?.status || 'pending');
  const [saving, setSaving] = useState(false);

  const selectedUser = users.find((u) => u.id === userId);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || (u.phone || '').includes(q) || u.username.toLowerCase().includes(q);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fine && !userId) {
      showToast('Selecciona una persona', 'error');
      return;
    }
    setSaving(true);
    try {
      if (fine) {
        await financesService.updateFine(fine.id, { date, amount: Number(amount), reason, status });
      } else {
        await financesService.createFine({ userId, date, amount: Number(amount), reason, status });
      }
      showToast(fine ? 'Multa actualizada' : 'Multa creada', 'success');
      onSaved();
    } catch (e) {
      showToast(getApiError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={fine ? 'Editar Multa' : 'Nueva Multa'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {!fine && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Persona</label>
            {selectedUser ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#1a1d38', border: '1px solid #2a2f5a', borderRadius: 10,
                padding: '10px 14px',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#3b5bdb33',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#6e8efb', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#e8eaf6' }}>{selectedUser.name}</div>
                  <div style={{ color: '#7c8db5', fontSize: 11 }}>@{selectedUser.username}</div>
                </div>
                <button type="button" onClick={() => setUserId('')} style={{
                  background: 'none', border: 'none', color: '#7c8db5', cursor: 'pointer', fontSize: 16,
                }}>✕</button>
              </div>
            ) : (
              <>
                <input
                  className="zetas-input"
                  type="text"
                  placeholder="Buscar por nombre, usuario o teléfono..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <div style={{
                  border: '1px solid #2a2f5a', borderRadius: 10,
                  maxHeight: 200, overflowY: 'auto', background: '#0f1020',
                }}>
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#7c8db5', fontSize: 13 }}>
                      {userSearch.trim() ? 'No se encontraron miembros' : 'No hay miembros'}
                    </div>
                  ) : (
                    filteredUsers.map((u, i) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setUserId(u.id); setUserSearch(''); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', textAlign: 'left', background: 'transparent',
                          border: 'none',
                          borderBottom: i < filteredUsers.length - 1 ? '1px solid #2a2f5a44' : 'none',
                          padding: '10px 14px', color: '#e8eaf6', cursor: 'pointer', fontSize: 13,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#3b5bdb18'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', background: '#3b5bdb33',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#6e8efb', fontWeight: 700, fontSize: 13, flexShrink: 0,
                        }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          <div style={{ color: '#7c8db5', fontSize: 11 }}>@{u.username}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Fecha</label>
          <input className="zetas-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Monto (COP)</label>
          <input className="zetas-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Motivo</label>
          <input className="zetas-input" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Ej: Inasistencia, No pagó, etc." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Estado</label>
          <select className="zetas-input" value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'paid')}>
            <option value="pending">Debe</option>
            <option value="paid">Pagado</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [jsonText, setJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ transactionsCreated: number; finesCreated: number; errors: string[] } | null>(null);

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload = JSON.parse(jsonText);
      const res = await financesService.importData(payload);
      setResult(res.data);
      showToast(`Importados: ${res.data.transactionsCreated} transacciones, ${res.data.finesCreated} multas`, 'success');
    } catch (e) {
      if (e instanceof SyntaxError) {
        showToast('JSON inválido', 'error');
      } else {
        showToast(getApiError(e), 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open title="Importar Datos Financieros" onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
          Pega el JSON con el formato: {`{ "transactions": [...], "fines": [...] }`}
        </label>
        <textarea
          className="zetas-textarea"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={12}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          placeholder={`{\n  "transactions": [\n    { "type": "expense", "date": "2026-01-18", "amount": 12000, "description": "Candado" }\n  ],\n  "fines": [\n    { "userPhone": "573166160159", "date": "2026-01-17", "amount": 5000, "reason": "Inasistencia", "status": "paid" }\n  ]\n}`}
        />
      </div>
      {result && (
        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 13 }}>
          <div>Transacciones creadas: {result.transactionsCreated}</div>
          <div>Multas creadas: {result.finesCreated}</div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 8, color: '#ef5350' }}>
              <strong>Errores:</strong>
              {result.errors.map((err, i) => <div key={i}>• {err}</div>)}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={result ? onImported : onClose}>{result ? 'Cerrar' : 'Cancelar'}</button>
        {!result && (
          <button className="btn btn-primary" onClick={handleImport} disabled={importing || !jsonText.trim()}>
            {importing ? 'Importando...' : 'Importar'}
          </button>
        )}
      </div>
    </Modal>
  );
}
