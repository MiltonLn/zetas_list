import { useState, useEffect } from 'react';
import { financesService } from '../services/finances.service';
import { formatCurrency } from '../utils/currency';

export function FinesBanner() {
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    financesService.getMyFines()
      .then((res) => {
        setTotal(res.data.total);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || total === 0) return null;

  return (
    <div style={{
      background: 'rgba(239, 83, 80, 0.15)',
      border: '1px solid rgba(239, 83, 80, 0.3)',
      borderRadius: 8,
      padding: '10px 16px',
      margin: '12px 16px 0',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
    }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span>
        Tienes multas/deudas pendientes por <strong style={{ color: '#ef5350' }}>{formatCurrency(total)}</strong>.
        Contacta a un admin para ponerte al día y poder anotarte a partidos.
      </span>
    </div>
  );
}
