import { useRef, useState, type FormEvent } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import type { Tournament, TournamentFormat, Modalidad } from '../types';
import { TOURNAMENT_FORMAT_LABELS } from '../types';
import { getApiError } from '../services/api';

interface Props {
  tournament?: Tournament;
  onClose: () => void;
  onSaved: (t: Tournament) => void;
}

const FORMATS: TournamentFormat[] = ['groups_and_knockout', 'knockout_only'];
const MODALIDADES: Modalidad[] = ['seis_x_seis', 'cuatro_x_cuatro'];
const MODALIDAD_LABELS: Record<Modalidad, string> = {
  seis_x_seis: '6x6',
  cuatro_x_cuatro: '4x4',
};

function today() {
  return new Date().toISOString().substring(0, 10);
}

function toInputDate(iso?: string) {
  if (!iso) return '';
  return iso.substring(0, 10);
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  color: '#7c8db5',
  fontSize: 13,
  marginBottom: 6,
};

interface FileUploadRowProps {
  label: string;
  accept: string;
  currentUrl?: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
  uploading: boolean;
  hint?: string;
}

function FileUploadRow({ label, accept, currentUrl, file, onFileChange, uploading, hint }: FileUploadRowProps) {
  const ref = useRef<HTMLInputElement>(null);

  const fileName = file?.name ?? (currentUrl ? currentUrl.split('/').pop() : null);
  const hasFile = !!currentUrl || !!file;

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabel}>{label}</label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#1a2035',
          borderRadius: 10,
          padding: '10px 14px',
          border: '1px solid #2a2f5a',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasFile ? (
            <span style={{ color: '#c5cae9', fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
          ) : (
            <span style={{ color: '#4a5580', fontSize: 13 }}>
              {hint ?? 'Sin archivo'}
            </span>
          )}
        </div>
        {currentUrl && !file && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#6e8efb', fontSize: 12, whiteSpace: 'nowrap', textDecoration: 'none' }}
          >
            Ver ↗
          </a>
        )}
        {file && (
          <button
            type="button"
            onClick={() => { onFileChange(null); if (ref.current) ref.current.value = ''; }}
            style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => ref.current?.click()}
          style={{
            background: '#2a2f5a',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            color: '#c5cae9',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            opacity: uploading ? 0.5 : 1,
          }}
        >
          {uploading ? 'Subiendo…' : currentUrl && !file ? 'Reemplazar' : 'Elegir archivo'}
        </button>
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export function TournamentFormModal({ tournament, onClose, onSaved }: Props) {
  const isEdit = !!tournament;

  const [name, setName] = useState(tournament?.name ?? '');
  const [format, setFormat] = useState<TournamentFormat>(tournament?.format ?? 'groups_and_knockout');
  const [modalidad, setModalidad] = useState<Modalidad>(tournament?.modalidad ?? 'seis_x_seis');
  const [registrationOpenAt, setRegistrationOpenAt] = useState(toInputDate(tournament?.registrationOpenAt) || today());
  const [startDate, setStartDate] = useState(toInputDate(tournament?.startDate) || today());
  const [endDate, setEndDate] = useState(toInputDate(tournament?.endDate) || today());
  const [pricePerTeam, setPricePerTeam] = useState(String(tournament?.pricePerTeam ?? 0));
  const [prizeDescription, setPrizeDescription] = useState(tournament?.prizeDescription ?? '');
  const [maxTeams, setMaxTeams] = useState(String(tournament?.maxTeams ?? 8));
  const [minPlayers, setMinPlayers] = useState(String(tournament?.minPlayersPerTeam ?? 6));
  const [maxPlayers, setMaxPlayers] = useState(String(tournament?.maxPlayersPerTeam ?? 8));
  const [minZetas, setMinZetas] = useState(String(tournament?.minZetasMembers ?? 0));
  const [allowExternal, setAllowExternal] = useState(tournament?.allowExternalTeams ?? true);
  const [numberOfGroups, setNumberOfGroups] = useState(String(tournament?.numberOfGroups ?? ''));
  const [rules, setRules] = useState(tournament?.rules ?? '');

  const [rulesPdfFile, setRulesPdfFile] = useState<File | null>(null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        format,
        modalidad,
        registrationOpenAt,
        startDate,
        endDate,
        pricePerTeam: parseInt(pricePerTeam, 10) || 0,
        prizeDescription: prizeDescription || undefined,
        maxTeams: parseInt(maxTeams, 10),
        minPlayersPerTeam: parseInt(minPlayers, 10),
        maxPlayersPerTeam: parseInt(maxPlayers, 10),
        minZetasMembers: parseInt(minZetas, 10),
        allowExternalTeams: allowExternal,
        numberOfGroups: numberOfGroups ? parseInt(numberOfGroups, 10) : undefined,
        rules: rules || undefined,
      };

      let saved = isEdit
        ? (await tournamentsService.update(tournament!.id, payload)).data
        : (await tournamentsService.create(payload)).data;

      setSaving(false);

      // Upload files after save
      if (rulesPdfFile) {
        setUploadingPdf(true);
        try {
          const r = await tournamentsService.uploadRulesPdf(saved.id, rulesPdfFile);
          saved = r.data;
        } catch {
          setError('El torneo se guardó, pero hubo un error al subir el PDF de reglamento.');
        } finally {
          setUploadingPdf(false);
        }
      }

      if (flyerFile) {
        setUploadingFlyer(true);
        try {
          const r = await tournamentsService.uploadFlyer(saved.id, flyerFile);
          saved = r.data;
        } catch {
          setError((prev) => prev
            ? prev + ' También falló la subida del flyer.'
            : 'El torneo se guardó, pero hubo un error al subir el flyer.');
        } finally {
          setUploadingFlyer(false);
        }
      }

      onSaved(saved);
    } catch (e) {
      setSaving(false);
      setError(getApiError(e));
    }
  };

  const isBusy = saving || uploadingPdf || uploadingFlyer;
  const busyLabel = saving ? 'Guardando…' : uploadingPdf ? 'Subiendo PDF…' : uploadingFlyer ? 'Subiendo flyer…' : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 12px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: 28, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: '#7c8db5',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2 style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>
          {isEdit ? 'Editar torneo' : 'Nuevo torneo'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Nombre *</label>
            <input
              className="zetas-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Torneo Zetas 2026"
              required
            />
          </div>

          {/* Format + modalidad */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Formato *</label>
              <select
                className="zetas-input"
                value={format}
                onChange={(e) => setFormat(e.target.value as TournamentFormat)}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{TOURNAMENT_FORMAT_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Modalidad *</label>
              <select
                className="zetas-input"
                value={modalidad}
                onChange={(e) => setModalidad(e.target.value as Modalidad)}
              >
                {MODALIDADES.map((m) => (
                  <option key={m} value={m}>{MODALIDAD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Inscripciones abren *</label>
              <input
                type="date"
                className="zetas-input"
                value={registrationOpenAt}
                onChange={(e) => setRegistrationOpenAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={fieldLabel}>Fecha inicio *</label>
              <input
                type="date"
                className="zetas-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={fieldLabel}>Fecha fin *</label>
              <input
                type="date"
                className="zetas-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Price + maxTeams */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Precio por equipo (COP)</label>
              <input
                type="number"
                className="zetas-input"
                value={pricePerTeam}
                onChange={(e) => setPricePerTeam(e.target.value)}
                min={0}
              />
            </div>
            <div>
              <label style={fieldLabel}>Máx. equipos *</label>
              <input
                type="number"
                className="zetas-input"
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                min={2}
                required
              />
            </div>
          </div>

          {/* Players per team + zetas members */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Mín. jugadores/equipo</label>
              <input
                type="number"
                className="zetas-input"
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
                min={1}
              />
            </div>
            <div>
              <label style={fieldLabel}>Máx. jugadores/equipo</label>
              <input
                type="number"
                className="zetas-input"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                min={1}
              />
            </div>
            <div>
              <label style={fieldLabel}>Mín. miembros Zetas</label>
              <input
                type="number"
                className="zetas-input"
                value={minZetas}
                onChange={(e) => setMinZetas(e.target.value)}
                min={0}
              />
            </div>
          </div>

          {/* Groups + allow external */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>N° de grupos (grupos+knockout)</label>
              <input
                type="number"
                className="zetas-input"
                value={numberOfGroups}
                onChange={(e) => setNumberOfGroups(e.target.value)}
                min={1}
                placeholder="Ej: 2"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#c5cae9', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={allowExternal}
                  onChange={(e) => setAllowExternal(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#3b5bdb', cursor: 'pointer' }}
                />
                Permitir jugadores externos
              </label>
            </div>
          </div>

          {/* Prize */}
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Descripción del premio</label>
            <input
              className="zetas-input"
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              placeholder="Ej: 70% primer lugar, 30% segundo"
            />
          </div>

          {/* Rules text */}
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Reglas adicionales</label>
            <textarea
              className="zetas-input"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={3}
              placeholder="Notas o reglas especiales del torneo..."
              style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: 14 }}
            />
          </div>

          {/* File uploads */}
          <div style={{ borderTop: '1px solid #2a2f5a', paddingTop: 16, marginBottom: 6 }}>
            <p style={{ color: '#7c8db5', fontSize: 12, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Archivos opcionales
            </p>
            <FileUploadRow
              label="Reglamento (PDF)"
              accept="application/pdf"
              currentUrl={tournament?.rulesFileUrl}
              file={rulesPdfFile}
              onFileChange={setRulesPdfFile}
              uploading={uploadingPdf}
              hint="Sin reglamento PDF"
            />
            <FileUploadRow
              label="Flyer / imagen del torneo"
              accept="image/*"
              currentUrl={tournament?.flyerUrl}
              file={flyerFile}
              onFileChange={setFlyerFile}
              uploading={uploadingFlyer}
              hint="Sin flyer"
            />
          </div>

          {error && (
            <p style={{ color: '#ef5350', fontSize: 13, marginBottom: 14 }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={isBusy}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isBusy}>
              {isBusy ? busyLabel : isEdit ? 'Guardar cambios' : 'Crear torneo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
