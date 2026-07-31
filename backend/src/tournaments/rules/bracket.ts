import {
  BracketPair,
  BracketPreview,
  CompetitionRulesV1,
  TeamStanding,
} from './types';

export function generateRoundRobinPairs(
  teamIds: string[],
): Array<{ teamAId: string; teamBId: string }> {
  const pairs: Array<{ teamAId: string; teamBId: string }> = [];
  for (let first = 0; first < teamIds.length; first += 1) {
    for (let second = first + 1; second < teamIds.length; second += 1) {
      pairs.push({ teamAId: teamIds[first], teamBId: teamIds[second] });
    }
  }
  return pairs;
}

export function nextPowerOf2(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function highLowPairs(teamIds: string[]): BracketPair[] {
  const size = nextPowerOf2(teamIds.length);
  const padded: Array<string | null> = [
    ...teamIds,
    ...Array<string | null>(size - teamIds.length).fill(null),
  ];
  return Array.from({ length: size / 2 }, (_, index) => ({
    teamAId: padded[index],
    teamBId: padded[size - 1 - index],
  }));
}

export function crossGroupPairs(standings: TeamStanding[]): BracketPair[] {
  const groups = new Map<string, TeamStanding[]>();
  for (const standing of standings.filter((item) => item.qualified)) {
    const group = groups.get(standing.groupLabel) ?? [];
    group.push(standing);
    groups.set(standing.groupLabel, group);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (orderedGroups.length !== 2) {
    return highLowPairs(
      standings
        .filter((standing) => standing.qualified)
        .sort((a, b) => a.position - b.position || a.groupLabel.localeCompare(b.groupLabel))
        .map((standing) => standing.teamId),
    );
  }
  const first = orderedGroups[0][1].sort((a, b) => a.position - b.position);
  const second = orderedGroups[1][1].sort((a, b) => a.position - b.position);
  const count = Math.min(first.length, second.length);
  const pairs: BracketPair[] = [];
  for (let index = 0; index < count; index += 1) {
    pairs.push({
      teamAId: first[index].teamId,
      teamBId: second[count - 1 - index].teamId,
    });
  }
  const requiredPairs = nextPowerOf2(first.length + second.length) / 2;
  while (pairs.length < requiredPairs) {
    pairs.push({ teamAId: null, teamBId: null });
  }
  return pairs;
}

export function buildBracketPreview(
  teamIds: string[],
  rules: CompetitionRulesV1,
  standings?: TeamStanding[],
): BracketPreview {
  const firstRound =
    rules.knockoutStage.pairingStrategy === 'cross_group' && standings
      ? crossGroupPairs(standings)
      : highLowPairs(teamIds);
  const bracketSize = firstRound.length * 2;
  return {
    seeding: [...teamIds],
    firstRound,
    totalRounds: bracketSize > 1 ? Math.log2(bracketSize) : 0,
    includeThirdPlace: rules.knockoutStage.includeThirdPlace,
  };
}
