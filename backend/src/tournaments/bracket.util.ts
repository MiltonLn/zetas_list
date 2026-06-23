/**
 * Bracket and standings utilities for tournament management.
 */

export interface TeamStanding {
  teamId: string;
  groupLabel: string;
  wins: number;
  losses: number;
  points: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  pointsScored: number;
  pointsConceded: number;
}

export interface SetScore {
  scoreA: number;
  scoreB: number;
}

export interface MatchResult {
  teamAId: string;
  teamBId: string;
  sets: SetScore[];
}

/** Determine match winner from sets: team with more sets won wins. */
export function determineWinner(
  teamAId: string,
  teamBId: string,
  sets: SetScore[],
): string | null {
  let winsA = 0;
  let winsB = 0;
  for (const set of sets) {
    if (set.scoreA > set.scoreB) winsA++;
    else if (set.scoreB > set.scoreA) winsB++;
  }
  if (winsA > winsB) return teamAId;
  if (winsB > winsA) return teamBId;
  return null;
}

/** Calculate group standings from a list of match results. */
export function calculateGroupStandings(
  teams: { id: string; groupLabel: string }[],
  results: MatchResult[],
): TeamStanding[] {
  const map = new Map<string, TeamStanding>();

  for (const team of teams) {
    map.set(team.id, {
      teamId: team.id,
      groupLabel: team.groupLabel,
      wins: 0,
      losses: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
      setDiff: 0,
      pointsScored: 0,
      pointsConceded: 0,
    });
  }

  for (const result of results) {
    const a = map.get(result.teamAId);
    const b = map.get(result.teamBId);
    if (!a || !b) continue;

    let winsA = 0;
    let winsB = 0;
    for (const set of result.sets) {
      a.pointsScored += set.scoreA;
      a.pointsConceded += set.scoreB;
      b.pointsScored += set.scoreB;
      b.pointsConceded += set.scoreA;
      if (set.scoreA > set.scoreB) {
        winsA++;
        a.setsWon++;
        b.setsLost++;
      } else {
        winsB++;
        b.setsWon++;
        a.setsLost++;
      }
    }

    if (winsA > winsB) {
      a.wins++;
      a.points += 3;
      b.losses++;
    } else {
      b.wins++;
      b.points += 3;
      a.losses++;
    }
  }

  for (const standing of map.values()) {
    standing.setDiff = standing.setsWon - standing.setsLost;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
    return b.pointsScored - a.pointsScored;
  });
}

/** Generate round-robin matches for teams within the same group. */
export function generateRoundRobinPairs(
  teamIds: string[],
): { teamAId: string; teamBId: string }[] {
  const pairs: { teamAId: string; teamBId: string }[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push({ teamAId: teamIds[i], teamBId: teamIds[j] });
    }
  }
  return pairs;
}

/** Return the smallest power of 2 >= n. */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Seed bracket slots from group standings.
 * Standard cross-seeding: 1st group A vs 2nd group B, etc.
 * Returns ordered list of teamId | null (null = bye).
 */
export function seedKnockoutBracket(
  standingsByGroup: Map<string, TeamStanding[]>,
  teamsPerSlot: number = 2,
): (string | null)[] {
  const groups = Array.from(standingsByGroup.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const slots: (string | null)[] = [];

  // Extract top N per group
  const topTeams: string[][] = groups.map(([, standings]) =>
    standings.slice(0, teamsPerSlot).map((s) => s.teamId),
  );

  // Cross-seed: 1st-A, 2nd-B, 1st-B, 2nd-A, ... (simple interleave)
  const maxRounds = Math.max(...topTeams.map((t) => t.length));
  for (let round = 0; round < maxRounds; round++) {
    for (let g = 0; g < topTeams.length; g++) {
      slots.push(topTeams[g][round] ?? null);
    }
  }

  // Pad to next power of 2
  const padded = nextPowerOf2(slots.length);
  while (slots.length < padded) slots.push(null);

  return slots;
}
