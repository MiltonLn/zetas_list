import { useState } from 'react';
import { Modal } from '../Modal';
import { financesService } from '../../services/finances.service';
import { getApiError } from '../../services/api';
import { showToast } from '../../utils/toast';

export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
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
