import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketPreview } from './BracketPreview';
import { StandingsTable } from './StandingsTable';

describe('componentes públicos de torneo', () => {
  it('muestra posiciones, clasificados y criterio de desempate', () => {
    render(
      <StandingsTable standings={[{
        teamId: 't1',
        teamName: 'Zetas Azul',
        groupLabel: 'A',
        position: 1,
        qualified: true,
        wins: 3,
        losses: 0,
        points: 9,
        setsWon: 6,
        setsLost: 1,
        setDiff: 5,
        pointsScored: 175,
        pointsConceded: 140,
        pointDiff: 35,
        resolvedBy: 'setDifference',
      }]} />,
    );

    expect(screen.getByText('Zetas Azul')).toBeInTheDocument();
    expect(screen.getByText('✓ Clasifica')).toBeInTheDocument();
    expect(screen.getByTitle('Desempate por diferencia de sets')).toBeInTheDocument();
  });

  it('muestra semillas y cruces de la primera ronda', () => {
    render(
      <BracketPreview preview={{
        seeds: [
          { teamId: 't1', teamName: 'Zetas Azul', seed: 1 },
          { id: 't2', name: 'Zetas Rojo', seed: 2 },
        ],
        firstRound: [{
          teamA: { teamId: 't1', teamName: 'Zetas Azul' },
          teamB: { id: 't2', name: 'Zetas Rojo' },
          seedA: 1,
          seedB: 2,
        }],
      }} />,
    );

    expect(screen.getByText('Vista previa del bracket')).toBeInTheDocument();
    expect(screen.getAllByText(/Zetas Azul/)).toHaveLength(2);
    expect(screen.getAllByText(/Zetas Rojo/)).toHaveLength(2);
  });

  it('tolera la respuesta con IDs y resuelve nombres del torneo', () => {
    render(
      <BracketPreview
        teams={[{ id: 't1', name: 'Azul' }, { id: 't2', name: 'Rojo' }]}
        preview={{
          seeding: ['t1', 't2'],
          firstRound: [{ teamAId: 't1', teamBId: 't2' }],
        }}
      />,
    );
    expect(screen.getAllByText(/Azul/)).toHaveLength(2);
    expect(screen.getAllByText(/Rojo/)).toHaveLength(2);
  });
});
