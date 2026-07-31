import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  TournamentRulesEditor,
} from './TournamentRulesEditor';
import {
  DEFAULT_COMPETITION_RULES,
  TOURNAMENT_PRESETS,
  competitionRulesSummary,
} from './tournamentRules';

describe('TournamentRulesEditor', () => {
  it('define las tres plantillas requeridas', () => {
    expect(TOURNAMENT_PRESETS.league_and_knockout.label).toBe('Liga + semifinales');
    expect(TOURNAMENT_PRESETS.groups_and_knockout.numberOfGroups).toBe(2);
    expect(TOURNAMENT_PRESETS.knockout_only.label).toBe('Eliminación directa');
  });

  it('permite editar formato, valores y orden de desempates', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TournamentRulesEditor
        rules={DEFAULT_COMPETITION_RULES}
        showGroupStage
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Formato de partidos de grupo'), 'best_of_three');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      groupStage: expect.objectContaining({ matchFormat: 'best_of_three' }),
    }));

    await user.click(screen.getByLabelText('Alargue en fase inicial'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      groupStage: expect.objectContaining({ winByTwo: false }),
    }));

    rerender(
      <TournamentRulesEditor
        rules={DEFAULT_COMPETITION_RULES}
        showGroupStage
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Bajar Partidos ganados'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      groupStage: expect.objectContaining({
        tiebreakers: ['setDifference', 'wins', 'pointDifference', 'headToHead'],
      }),
    }));
  });

  it('resume y bloquea reglas de torneos no borrador', () => {
    render(
      <TournamentRulesEditor
        rules={DEFAULT_COMPETITION_RULES}
        showGroupStage
        disabled
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(competitionRulesSummary(DEFAULT_COMPETITION_RULES))).toBeInTheDocument();
    expect(screen.getByText(/no se pueden modificar/)).toBeInTheDocument();
  });
});
