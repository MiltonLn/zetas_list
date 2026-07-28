import { useState } from 'react';
import { Pagination } from '../Pagination';
import { PAGE_SIZE } from './constants';
import { formatCurrency, formatDate } from '../../utils/currency';
import type { Fine } from '../../services/finances.service';

export function FinesTable({ fines, onEdit, onDelete, onMarkPaid, isDeleteArmed }: {
  fines: Fine[];
  onEdit: (f: Fine) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  isDeleteArmed: (id: string) => boolean;
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
      case 'name': cmp = (a.user?.name || a.userName || '').localeCompare(b.user?.name || b.userName || ''); break;
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
                  <td style={{ padding: '8px 12px' }}>{f.user?.name || f.userName || 'Sin asignar'}</td>
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
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '2px 8px', color: '#ef5350' }}
                      aria-label={isDeleteArmed(f.id) ? `Confirmar eliminación de multa de ${f.user?.name || f.userName || 'usuario'}` : `Eliminar multa de ${f.user?.name || f.userName || 'usuario'}`}
                      onClick={() => onDelete(f.id)}
                    >
                      {isDeleteArmed(f.id) ? '¿Seguro?' : 'Eliminar'}
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
