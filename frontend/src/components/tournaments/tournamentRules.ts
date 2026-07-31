import type { CompetitionRulesV1, StandingsTiebreaker, TournamentFormat } from '../../types';

export const DEFAULT_COMPETITION_RULES: CompetitionRulesV1 = {
  version: 1,
  groupStage: {
    matchFormat: 'two_sets_point_difference',
    qualifiersPerGroup: 2,
    standingsPoints: {
      straightWin: 3,
      splitWin: 2,
      splitLoss: 1,
      straightLoss: 0,
    },
    tiebreakers: ['wins', 'setDifference', 'pointDifference', 'headToHead'],
    regularSetPoints: 25,
    tiebreakSetPoints: 15,
    winByTwo: true,
  },
  knockoutStage: {
    matchFormat: 'best_of_three',
    regularSetPoints: 25,
    tiebreakSetPoints: 15,
    winByTwo: true,
    includeThirdPlace: false,
    pairingStrategy: 'high_low',
  },
};

export const TOURNAMENT_PRESETS: Record<
  TournamentFormat,
  { label: string; numberOfGroups?: number; rules: CompetitionRulesV1 }
> = {
  league_and_knockout: {
    label: 'Liga + semifinales',
    rules: {
      ...DEFAULT_COMPETITION_RULES,
      groupStage: { ...DEFAULT_COMPETITION_RULES.groupStage, qualifiersPerGroup: 4 },
    },
  },
  groups_and_knockout: {
    label: 'Dos grupos + semifinales',
    numberOfGroups: 2,
    rules: {
      ...DEFAULT_COMPETITION_RULES,
      knockoutStage: {
        ...DEFAULT_COMPETITION_RULES.knockoutStage,
        pairingStrategy: 'cross_group',
      },
    },
  },
  knockout_only: {
    label: 'Eliminación directa',
    rules: {
      ...DEFAULT_COMPETITION_RULES,
      knockoutStage: {
        ...DEFAULT_COMPETITION_RULES.knockoutStage,
        pairingStrategy: 'high_low',
      },
    },
  },
};

export const TIEBREAKER_LABELS: Record<StandingsTiebreaker, string> = {
  wins: 'Partidos ganados',
  setDifference: 'Diferencia de sets',
  pointDifference: 'Diferencia de puntos',
  headToHead: 'Enfrentamiento directo',
};

export function competitionRulesSummary(rules: CompetitionRulesV1): string {
  const groupFormat = rules.groupStage.matchFormat === 'two_sets_point_difference'
    ? '2 sets y desempate corto por diferencia de puntos'
    : 'mejor de 3 sets';
  const groupExtension = rules.groupStage.winByTwo ? 'con alargue' : 'sin alargue';
  const knockoutExtension = rules.knockoutStage.winByTwo ? 'con alargue' : 'sin alargue';
  return `Grupos: ${groupFormat}, ${groupExtension}, clasifican ${rules.groupStage.qualifiersPerGroup}. Eliminación: mejor de 3, ${knockoutExtension}${rules.knockoutStage.includeThirdPlace ? ', con tercer puesto' : ''}.`;
}
