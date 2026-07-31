import { TournamentFormat } from '@prisma/client';
import {
  buildBracketPreview,
  calculateStandings,
  defaultCompetitionRules,
  evaluateMatchResult,
  generateRoundRobinPairs,
} from '.';
import { CompletedMatchResult, SetScore } from './types';

interface ScenarioMatch {
  phase: 'group' | 'knockout';
  teamAId: string;
  teamBId: string;
  sets: SetScore[];
  winnerId: string;
}

describe('Tournament rules full scenario', () => {
  it('clasifica dos grupos, genera semifinales cruzadas y define al campeón', () => {
    const rules = defaultCompetitionRules(
      TournamentFormat.groups_and_knockout,
    );
    rules.groupStage.matchFormat = 'two_sets_point_difference';
    rules.groupStage.qualifiersPerGroup = 2;
    rules.knockoutStage.pairingStrategy = 'cross_group';

    const teams = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'].map(
      (id) => ({ id, groupLabel: id.charAt(0) }),
    );
    const groupResults: CompletedMatchResult[] = [];
    const state: ScenarioMatch[] = [];

    for (const groupLabel of ['A', 'B']) {
      const teamIds = teams
        .filter((team) => team.groupLabel === groupLabel)
        .map((team) => team.id);
      for (const pair of generateRoundRobinPairs(teamIds)) {
        const sets = [
          { scoreA: 25, scoreB: 20 },
          { scoreA: 25, scoreB: 18 },
        ];
        const result = evaluateMatchResult(
          pair.teamAId,
          pair.teamBId,
          sets,
          'group',
          rules,
        );
        groupResults.push({ ...pair, sets });
        state.push({
          phase: 'group',
          ...pair,
          sets,
          winnerId: result.winnerId,
        });
      }
    }

    const standings = calculateStandings(teams, groupResults, rules);
    expect(
      standings
        .filter((standing) => standing.qualified)
        .map((standing) => `${standing.groupLabel}${standing.position}`),
    ).toEqual(['A1', 'A2', 'B1', 'B2']);

    const qualifiedIds = standings
      .filter((standing) => standing.qualified)
      .map((standing) => standing.teamId);
    const preview = buildBracketPreview(qualifiedIds, rules, standings);
    expect(preview.firstRound).toEqual([
      { teamAId: 'A1', teamBId: 'B2' },
      { teamAId: 'A2', teamBId: 'B1' },
    ]);

    const semifinalResults = preview.firstRound.map((pair, index) => {
      const teamAId = pair.teamAId!;
      const teamBId = pair.teamBId!;
      const sets =
        index === 0
          ? [
              { scoreA: 25, scoreB: 20 },
              { scoreA: 20, scoreB: 25 },
              { scoreA: 15, scoreB: 12 },
            ]
          : [
              { scoreA: 20, scoreB: 25 },
              { scoreA: 18, scoreB: 25 },
            ];
      const result = evaluateMatchResult(
        teamAId,
        teamBId,
        sets,
        'knockout',
        rules,
      );
      state.push({
        phase: 'knockout',
        teamAId,
        teamBId,
        sets,
        winnerId: result.winnerId,
      });
      return result;
    });

    const finalSets = [
      { scoreA: 25, scoreB: 21 },
      { scoreA: 25, scoreB: 19 },
    ];
    const finalResult = evaluateMatchResult(
      semifinalResults[0].winnerId,
      semifinalResults[1].winnerId,
      finalSets,
      'knockout',
      rules,
    );
    state.push({
      phase: 'knockout',
      teamAId: semifinalResults[0].winnerId,
      teamBId: semifinalResults[1].winnerId,
      sets: finalSets,
      winnerId: finalResult.winnerId,
    });

    expect(finalResult.winnerId).toBe('A1');
    expect(state).toHaveLength(15);
  });
});
