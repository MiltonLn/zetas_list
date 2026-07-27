interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0' }}>
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page === 1} onClick={() => onPageChange(page - 1)}>← Anterior</button>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Pág. {page} de {totalPages}</span>
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Siguiente →</button>
    </div>
  );
}
