import type {
  CompetitionRulesV1,
  GroupMatchFormat,
} from '../../types';
import { competitionRulesSummary, TIEBREAKER_LABELS } from './tournamentRules';

const inputStyle: React.CSSProperties = { width: '100%' };

interface Props {
  rules: CompetitionRulesV1;
  disabled?: boolean;
  showGroupStage: boolean;
  onChange: (rules: CompetitionRulesV1) => void;
}

export function TournamentRulesEditor({ rules, disabled = false, showGroupStage, onChange }: Props) {
  const updateGroup = (patch: Partial<CompetitionRulesV1['groupStage']>) =>
    onChange({ ...rules, groupStage: { ...rules.groupStage, ...patch } });
  const updateKnockout = (patch: Partial<CompetitionRulesV1['knockoutStage']>) =>
    onChange({ ...rules, knockoutStage: { ...rules.knockoutStage, ...patch } });

  const moveTiebreaker = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rules.groupStage.tiebreakers.length) return;
    const next = [...rules.groupStage.tiebreakers];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updateGroup({ tiebreakers: next });
  };

  if (disabled) {
    return (
      <div className="card" style={{ padding: 14, color: '#a7b0d0', fontSize: 13 }}>
        <strong style={{ display: 'block', color: '#e8eaf6', marginBottom: 5 }}>Reglas de competencia</strong>
        {competitionRulesSummary(rules)}
        <div style={{ color: '#7c8db5', marginTop: 6 }}>
          Las reglas no se pueden modificar después de abrir las inscripciones.
        </div>
      </div>
    );
  }

  return (
    <section style={{ borderTop: '1px solid #2a2f5a', paddingTop: 16, marginTop: 4 }}>
      <h3 style={{ color: '#e8eaf6', fontSize: 15, margin: '0 0 12px' }}>Reglas de competencia</h3>

      {showGroupStage && (
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ color: '#c5cae9', fontSize: 13, margin: '0 0 10px' }}>Fase inicial</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <label style={{ color: '#7c8db5', fontSize: 12 }}>
              Formato de partidos
              <select
                aria-label="Formato de partidos de grupo"
                className="zetas-input"
                value={rules.groupStage.matchFormat}
                onChange={(e) => updateGroup({ matchFormat: e.target.value as GroupMatchFormat })}
              >
                <option value="two_sets_point_difference">2 sets + diferencia</option>
                <option value="best_of_three">Mejor de 3</option>
              </select>
            </label>
            <NumberField label="Clasificados por grupo" value={rules.groupStage.qualifiersPerGroup} min={1} onChange={(value) => updateGroup({ qualifiersPerGroup: value })} />
            <NumberField label="Puntos por set regular" value={rules.groupStage.regularSetPoints} min={1} onChange={(value) => updateGroup({ regularSetPoints: value })} />
            <NumberField label="Puntos set desempate" value={rules.groupStage.tiebreakSetPoints} min={1} onChange={(value) => updateGroup({ tiebreakSetPoints: value })} />
            <BooleanField
              label="Alargue en fase inicial"
              checked={rules.groupStage.winByTwo}
              onChange={(checked) => updateGroup({ winByTwo: checked })}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#7c8db5', fontSize: 12, marginBottom: 6 }}>Puntos de clasificación</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {([
                ['straightWin', 'Victoria 2-0'],
                ['splitWin', 'Victoria 1-1'],
                ['splitLoss', 'Derrota 1-1'],
                ['straightLoss', 'Derrota 0-2'],
              ] as const).map(([key, label]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={rules.groupStage.standingsPoints[key]}
                  onChange={(value) => updateGroup({
                    standingsPoints: { ...rules.groupStage.standingsPoints, [key]: value },
                  })}
                />
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#7c8db5', fontSize: 12, marginBottom: 6 }}>Desempates (en orden)</div>
            {rules.groupStage.tiebreakers.map((item, index) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, color: '#c5cae9', fontSize: 13 }}>
                <span style={{ width: 20 }}>{index + 1}.</span>
                <span style={{ flex: 1 }}>{TIEBREAKER_LABELS[item]}</span>
                <button type="button" aria-label={`Subir ${TIEBREAKER_LABELS[item]}`} className="btn btn-sm btn-secondary" disabled={index === 0} onClick={() => moveTiebreaker(index, -1)}>↑</button>
                <button type="button" aria-label={`Bajar ${TIEBREAKER_LABELS[item]}`} className="btn btn-sm btn-secondary" disabled={index === rules.groupStage.tiebreakers.length - 1} onClick={() => moveTiebreaker(index, 1)}>↓</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 style={{ color: '#c5cae9', fontSize: 13, margin: '0 0 10px' }}>Fase eliminatoria</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <label style={{ color: '#7c8db5', fontSize: 12 }}>
            Formato
            <select className="zetas-input" value="best_of_three" disabled>
              <option value="best_of_three">Mejor de 3</option>
            </select>
          </label>
          <NumberField label="Puntos por set regular" value={rules.knockoutStage.regularSetPoints} min={1} onChange={(value) => updateKnockout({ regularSetPoints: value })} />
          <NumberField label="Puntos set desempate" value={rules.knockoutStage.tiebreakSetPoints} min={1} onChange={(value) => updateKnockout({ tiebreakSetPoints: value })} />
          <BooleanField
            label="Alargue en eliminación"
            checked={rules.knockoutStage.winByTwo}
            onChange={(checked) => updateKnockout({ winByTwo: checked })}
          />
          <label style={{ color: '#7c8db5', fontSize: 12 }}>
            Cruces
            <select
              aria-label="Estrategia de cruces"
              className="zetas-input"
              value={rules.knockoutStage.pairingStrategy}
              onChange={(e) => updateKnockout({ pairingStrategy: e.target.value as 'high_low' | 'cross_group' })}
            >
              <option value="high_low">Mejor contra peor</option>
              <option value="cross_group">Cruce entre grupos</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c5cae9', fontSize: 13, paddingTop: 20 }}>
            <input
              type="checkbox"
              checked={rules.knockoutStage.includeThirdPlace}
              onChange={(e) => updateKnockout({ includeThirdPlace: e.target.checked })}
            />
            Partido por tercer puesto
          </label>
        </div>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ color: '#7c8db5', fontSize: 12 }}>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        className="zetas-input"
        style={inputStyle}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function BooleanField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c5cae9', fontSize: 13, paddingTop: 20 }}>
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Exigir diferencia de 2 puntos
    </label>
  );
}
