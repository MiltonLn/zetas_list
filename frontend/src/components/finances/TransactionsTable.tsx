import { useState } from 'react';
import { Pagination } from '../Pagination';
import { PAGE_SIZE } from './constants';
import { formatCurrency, formatDate } from '../../utils/currency';
import type { FinanceTransaction } from '../../services/finances.service';

export function TransactionsTable({ transactions, onEdit, onDelete, isDeleteArmed }: {
  transactions: FinanceTransaction[];
  onEdit: (tx: FinanceTransaction) => void;
  onDelete: (id: string) => void;
  isDeleteArmed: (id: string) => boolean;
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
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '2px 8px', color: '#ef5350' }}
                      aria-label={isDeleteArmed(tx.id) ? `Confirmar eliminación de ${tx.description}` : `Eliminar ${tx.description}`}
                      onClick={() => onDelete(tx.id)}
                    >
                      {isDeleteArmed(tx.id) ? '¿Seguro?' : 'Eliminar'}
                    </button>
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
