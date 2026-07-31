export type GroupMatchFormat = 'two_sets_point_difference' | 'best_of_three';
export type KnockoutMatchFormat = 'best_of_three';
export type StandingsTiebreaker =
  | 'wins'
  | 'setDifference'
  | 'pointDifference'
  | 'headToHead';
export type PairingStrategy = 'high_low' | 'cross_group';

export interface CompetitionRulesV1 {
  version: 1;
  groupStage: {
    matchFormat: GroupMatchFormat;
    qualifiersPerGroup: number;
    standingsPoints: {
      straightWin: number;
      splitWin: number;
      splitLoss: number;
      straightLoss: number;
    };
    tiebreakers: StandingsTiebreaker[];
    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
  };
  knockoutStage: {
    matchFormat: KnockoutMatchFormat;
    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
    includeThirdPlace: boolean;
    pairingStrategy: PairingStrategy;
  };
}

export interface SetScore {
  setNumber?: number;
  scoreA: number;
  scoreB: number;
}

export interface EvaluatedMatchResult {
  winnerId: string;
  loserId: string;
  setsWonA: number;
  setsWonB: number;
  pointsA: number;
  pointsB: number;
  tablePointsA: number;
  tablePointsB: number;
}

export interface CompletedMatchResult {
  teamAId: string;
  teamBId: string;
  sets: SetScore[];
}

export interface TeamStanding {
  teamId: string;
  groupLabel: string;
  position: number;
  wins: number;
  losses: number;
  points: number;
  setsWon: number;
  setsLost: number;
  setDifference: number;
  pointsScored: number;
  pointsConceded: number;
  pointDifference: number;
  qualified: boolean;
  resolvedBy?: StandingsTiebreaker | 'teamId';
}

export interface BracketPair {
  teamAId: string | null;
  teamBId: string | null;
}

export interface BracketPreview {
  seeding: string[];
  firstRound: BracketPair[];
  totalRounds: number;
  includeThirdPlace: boolean;
}
