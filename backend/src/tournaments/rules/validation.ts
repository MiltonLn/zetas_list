import { CompetitionRulesV1, StandingsTiebreaker } from './types';

const GROUP_FORMATS = new Set(['two_sets_point_difference', 'best_of_three']);
const TIEBREAKERS = new Set<StandingsTiebreaker>([
  'wins',
  'setDifference',
  'pointDifference',
  'headToHead',
]);
const PAIRING_STRATEGIES = new Set(['high_low', 'cross_group']);

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateCompetitionRules(rules: unknown): rules is CompetitionRulesV1 {
  if (!rules || typeof rules !== 'object') return false;
  const candidate = rules as Record<string, unknown>;
  if (candidate.version !== 1) return false;
  const group = candidate.groupStage as Record<string, unknown> | undefined;
  const knockout = candidate.knockoutStage as Record<string, unknown> | undefined;
  if (!group || !knockout) return false;
  const standings = group.standingsPoints as Record<string, unknown> | undefined;
  const tiebreakers = group.tiebreakers;

  return (
    GROUP_FORMATS.has(String(group.matchFormat)) &&
    isPositiveInteger(group.qualifiersPerGroup) &&
    !!standings &&
    isNonNegativeNumber(standings.straightWin) &&
    isNonNegativeNumber(standings.splitWin) &&
    isNonNegativeNumber(standings.splitLoss) &&
    isNonNegativeNumber(standings.straightLoss) &&
    Array.isArray(tiebreakers) &&
    tiebreakers.length > 0 &&
    new Set(tiebreakers).size === tiebreakers.length &&
    tiebreakers.every((item) => TIEBREAKERS.has(item as StandingsTiebreaker)) &&
    isPositiveInteger(group.regularSetPoints) &&
    isPositiveInteger(group.tiebreakSetPoints) &&
    typeof group.winByTwo === 'boolean' &&
    knockout.matchFormat === 'best_of_three' &&
    isPositiveInteger(knockout.regularSetPoints) &&
    isPositiveInteger(knockout.tiebreakSetPoints) &&
    typeof knockout.winByTwo === 'boolean' &&
    typeof knockout.includeThirdPlace === 'boolean' &&
    PAIRING_STRATEGIES.has(String(knockout.pairingStrategy))
  );
}

export function parseCompetitionRules(value: unknown): CompetitionRulesV1 {
  if (!validateCompetitionRules(value)) {
    throw new Error('La configuración de competencia no es válida');
  }
  return value;
}
