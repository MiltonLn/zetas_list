import type { TeamStanding } from '../../types';

const RESOLVED_BY_LABELS: Record<NonNullable<TeamStanding['resolvedBy']>, string> = {
  wins: 'partidos ganados',
  setDifference: 'diferencia de sets',
  pointDifference: 'diferencia de puntos',
  headToHead: 'enfrentamiento directo',
  teamId: 'orden estable del sistema',
};

interface Props {
  standings: TeamStanding[];
  teams?: Array<{ id: string; name: string }>;
}

export function StandingsTable({ standings, teams = [] }: Props) {
  if (standings.length === 0) {
    return <div className="card" style={{ color: '#7c8db5', textAlign: 'center' }}>Aún no hay posiciones disponibles.</div>;
  }

  const byGroup = standings.reduce((groups, standing) => {
    const label = standing.groupLabel || 'General';
    const current = groups.get(label) ?? [];
    current.push(standing);
    groups.set(label, current);
    return groups;
  }, new Map<string, TeamStanding[]>());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from(byGroup.entries()).map(([group, entries]) => (
        <div key={group}>
          <div style={{ color: '#6e8efb', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {group === 'General' ? 'CLASIFICACIÓN GENERAL' : `GRUPO ${group}`}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#7c8db5', borderBottom: '1px solid #2a2f5a' }}>
                  <Header>#</Header><Header>Equipo</Header><Header>PG</Header><Header>PP</Header>
                  <Header>Pts.</Header><Header>Sets</Header><Header>Dif.</Header>
                  <Header>Puntos juego</Header><Header>Dif.</Header>
                </tr>
              </thead>
              <tbody>
                {[...entries].sort((a, b) => a.position - b.position).map((entry) => (
                  <tr
                    key={entry.teamId}
                    style={{
                      borderBottom: '1px solid #202641',
                      color: entry.qualified ? '#e8eaf6' : '#a7b0d0',
                      background: entry.qualified ? '#2ecc710b' : 'transparent',
                    }}
                  >
                    <Cell>{entry.position}</Cell>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>
                      {entry.teamName ?? teams.find((team) => team.id === entry.teamId)?.name ?? entry.teamId}
                      {entry.qualified && <span style={{ color: '#2ecc71', marginLeft: 6 }}>✓ Clasifica</span>}
                      {entry.resolvedBy && (
                        <span title={`Desempate por ${RESOLVED_BY_LABELS[entry.resolvedBy]}`} style={{ color: '#7c8db5', marginLeft: 5 }}>ⓘ</span>
                      )}
                    </td>
                    <Cell>{entry.wins}</Cell><Cell>{entry.losses}</Cell><Cell>{entry.points}</Cell>
                    <Cell>{entry.setsWon}–{entry.setsLost}</Cell><Cell>{signed(entry.setDiff ?? entry.setDifference ?? 0)}</Cell>
                    <Cell>{entry.pointsScored}–{entry.pointsConceded}</Cell><Cell>{signed(entry.pointDiff ?? entry.pointDifference ?? 0)}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function Header({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '7px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>{children}</td>;
}
