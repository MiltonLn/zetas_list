import { TournamentFormat } from '@prisma/client';
import { CompetitionRulesV1 } from './types';

export interface CompetitionRulesInput {
  version?: 1;
  groupStage?: Omit<Partial<CompetitionRulesV1['groupStage']>, 'standingsPoints'> & {
    standingsPoints?: Partial<CompetitionRulesV1['groupStage']['standingsPoints']>;
  };
  knockoutStage?: Partial<CompetitionRulesV1['knockoutStage']>;
}

const BASE_RULES: CompetitionRulesV1 = {
  version: 1,
  groupStage: {
    matchFormat: 'best_of_three',
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
    includeThirdPlace: true,
    pairingStrategy: 'cross_group',
  },
};

export function defaultCompetitionRules(format: TournamentFormat): CompetitionRulesV1 {
  return {
    ...BASE_RULES,
    groupStage: {
      ...BASE_RULES.groupStage,
      standingsPoints: { ...BASE_RULES.groupStage.standingsPoints },
      tiebreakers: [...BASE_RULES.groupStage.tiebreakers],
    },
    knockoutStage: {
      ...BASE_RULES.knockoutStage,
      pairingStrategy:
        format === TournamentFormat.groups_and_knockout ? 'cross_group' : 'high_low',
    },
  };
}

export function applyCompetitionRuleDefaults(
  format: TournamentFormat,
  rules?: CompetitionRulesInput,
): CompetitionRulesV1 {
  const defaults = defaultCompetitionRules(format);
  return {
    version: 1,
    groupStage: {
      ...defaults.groupStage,
      ...rules?.groupStage,
      standingsPoints: {
        ...defaults.groupStage.standingsPoints,
        ...rules?.groupStage?.standingsPoints,
      },
      tiebreakers:
        rules?.groupStage?.tiebreakers ?? defaults.groupStage.tiebreakers,
    },
    knockoutStage: {
      ...defaults.knockoutStage,
      ...rules?.knockoutStage,
    },
  };
}
