import { useState } from 'react';
import { Modal } from '../Modal';
import { financesService, type FinanceTransaction } from '../../services/finances.service';
import { getApiError } from '../../services/api';
import { showToast } from '../../utils/toast';

export function TransactionModal({ transaction, onClose, onSaved }: {
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
