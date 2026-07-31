import { evaluateMatchResult } from './match-result';
import {
  CompletedMatchResult,
  CompetitionRulesV1,
  StandingsTiebreaker,
  TeamStanding,
} from './types';

interface TeamInput {
  id: string;
  groupLabel: string;
}

function emptyStanding(team: TeamInput): TeamStanding {
  return {
    teamId: team.id,
    groupLabel: team.groupLabel,
    position: 0,
    wins: 0,
    losses: 0,
    points: 0,
    setsWon: 0,
    setsLost: 0,
    setDifference: 0,
    pointsScored: 0,
    pointsConceded: 0,
    pointDifference: 0,
    qualified: false,
  };
}

function headToHeadWinner(
  teamAId: string,
  teamBId: string,
  results: CompletedMatchResult[],
  rules: CompetitionRulesV1,
): string | undefined {
  const direct = results.find(
    (result) =>
      (result.teamAId === teamAId && result.teamBId === teamBId) ||
      (result.teamAId === teamBId && result.teamBId === teamAId),
  );
  if (!direct) return undefined;
  return evaluateMatchResult(
    direct.teamAId,
    direct.teamBId,
    direct.sets,
    'group',
    rules,
  ).winnerId;
}

function tiebreakValue(standing: TeamStanding, tiebreaker: StandingsTiebreaker): number {
  if (tiebreaker === 'wins') return standing.wins;
  if (tiebreaker === 'setDifference') return standing.setDifference;
  if (tiebreaker === 'pointDifference') return standing.pointDifference;
  return 0;
}

export function calculateStandings(
  teams: TeamInput[],
  results: CompletedMatchResult[],
  rules: CompetitionRulesV1,
): TeamStanding[] {
  const standings = new Map(teams.map((team) => [team.id, emptyStanding(team)]));

  for (const result of results) {
    const teamA = standings.get(result.teamAId);
    const teamB = standings.get(result.teamBId);
    if (!teamA || !teamB || teamA.groupLabel !== teamB.groupLabel) continue;
    const evaluated = evaluateMatchResult(
      result.teamAId,
      result.teamBId,
      result.sets,
      'group',
      rules,
    );
    teamA.wins += Number(evaluated.winnerId === teamA.teamId);
    teamA.losses += Number(evaluated.loserId === teamA.teamId);
    teamB.wins += Number(evaluated.winnerId === teamB.teamId);
    teamB.losses += Number(evaluated.loserId === teamB.teamId);
    teamA.points += evaluated.tablePointsA;
    teamB.points += evaluated.tablePointsB;
    teamA.setsWon += evaluated.setsWonA;
    teamA.setsLost += evaluated.setsWonB;
    teamB.setsWon += evaluated.setsWonB;
    teamB.setsLost += evaluated.setsWonA;
    teamA.pointsScored += evaluated.pointsA;
    teamA.pointsConceded += evaluated.pointsB;
    teamB.pointsScored += evaluated.pointsB;
    teamB.pointsConceded += evaluated.pointsA;
  }

  for (const standing of standings.values()) {
    standing.setDifference = standing.setsWon - standing.setsLost;
    standing.pointDifference = standing.pointsScored - standing.pointsConceded;
  }

  const byGroup = new Map<string, TeamStanding[]>();
  for (const standing of standings.values()) {
    const group = byGroup.get(standing.groupLabel) ?? [];
    group.push(standing);
    byGroup.set(standing.groupLabel, group);
  }

  const ordered: TeamStanding[] = [];
  for (const [groupLabel, group] of [...byGroup.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    group.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (const tiebreaker of rules.groupStage.tiebreakers) {
        if (tiebreaker === 'headToHead') {
          const winner = headToHeadWinner(a.teamId, b.teamId, results, rules);
          if (winner) {
            a.resolvedBy ??= 'headToHead';
            b.resolvedBy ??= 'headToHead';
            return winner === a.teamId ? -1 : 1;
          }
          continue;
        }
        const difference = tiebreakValue(b, tiebreaker) - tiebreakValue(a, tiebreaker);
        if (difference !== 0) {
          a.resolvedBy ??= tiebreaker;
          b.resolvedBy ??= tiebreaker;
          return difference;
        }
      }
      a.resolvedBy ??= 'teamId';
      b.resolvedBy ??= 'teamId';
      return a.teamId.localeCompare(b.teamId);
    });
    group.forEach((standing, index) => {
      standing.position = index + 1;
      standing.qualified = index < rules.groupStage.qualifiersPerGroup;
    });
    ordered.push(...group.map((standing) => ({ ...standing, groupLabel })));
  }
  return ordered;
}

export function qualifiedTeamIds(standings: TeamStanding[]): string[] {
  return standings.filter((standing) => standing.qualified).map((standing) => standing.teamId);
}
