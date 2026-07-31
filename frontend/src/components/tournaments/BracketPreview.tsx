import type { BracketPreviewResponse, BracketPreviewTeam } from '../../types';

function teamName(team?: BracketPreviewTeam | null): string {
  return team?.name ?? team?.teamName ?? team?.teamId ?? team?.id ?? 'Por definir';
}

interface Props {
  preview: BracketPreviewResponse;
  teams?: Array<{ id: string; name: string }>;
}

export function BracketPreview({ preview, teams = [] }: Props) {
  const resolveTeam = (team: BracketPreviewTeam | string | null | undefined): BracketPreviewTeam | null => {
    if (!team) return null;
    if (typeof team !== 'string') return team;
    const found = teams.find((candidate) => candidate.id === team);
    return { teamId: team, teamName: found?.name };
  };
  const seeds = (preview.seeds ?? preview.seeding ?? []).map(resolveTeam).filter(
    (team): team is BracketPreviewTeam => team !== null,
  );

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ color: '#e8eaf6', margin: '0 0 12px', fontSize: 14 }}>Vista previa del bracket</h4>
      {seeds.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#7c8db5', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>CLASIFICADOS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {seeds.map((team, index) => (
              <span key={team.teamId ?? team.id ?? index} style={{ color: '#c5cae9', background: '#202641', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                {team.seed ?? index + 1}. {teamName(team)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ color: '#7c8db5', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>PRIMERA RONDA</div>
      {preview.firstRound.length === 0 ? (
        <div style={{ color: '#7c8db5', fontSize: 13 }}>No hay cruces para mostrar.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {preview.firstRound.map((pair, index) => {
            const teamA = resolveTeam(pair.teamA ?? pair.teamAId);
            const teamB = resolveTeam(pair.teamB ?? pair.teamBId);
            return (
              <div key={index} style={{ border: '1px solid #2a2f5a', borderRadius: 8, padding: 10, color: '#e8eaf6', fontSize: 13 }}>
              <div>{pair.seedA ? `${pair.seedA}. ` : ''}{teamName(teamA)}</div>
              <div style={{ color: '#4a5580', fontSize: 11, margin: '3px 0' }}>contra</div>
              <div>{pair.seedB ? `${pair.seedB}. ` : ''}{teamName(teamB)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
