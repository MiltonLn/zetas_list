import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Modal } from '../components/Modal';
import { financesService, type FinanceTransaction, type Fine } from '../services/finances.service';
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
  if (transactions.length === 0) {
    return <div className="card" style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay transacciones</div>;
  }
  return (
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Fecha</th>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tipo</th>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Descripción</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto</th>
            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
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
    </div>
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
  if (fines.length === 0) {
    return <div className="card" style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No hay multas o deudas</div>;
  }
  return (
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Fecha</th>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nombre</th>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Motivo</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto</th>
            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Estado</th>
            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {fines.map((f) => (
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
    </div>
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
  const [date, setDate] = useState(fine?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(String(fine?.amount || ''));
  const [reason, setReason] = useState(fine?.reason || '');
  const [status, setStatus] = useState<'pending' | 'paid'>(fine?.status || 'pending');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            <select className="zetas-input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Seleccionar...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
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
