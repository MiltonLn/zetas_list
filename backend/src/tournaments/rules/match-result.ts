import {
  CompetitionRulesV1,
  EvaluatedMatchResult,
  SetScore,
} from './types';

export class MatchResultValidationError extends Error {}

function validateSet(
  set: SetScore,
  target: number,
  winByTwo: boolean,
): void {
  if (
    !Number.isInteger(set.scoreA) ||
    !Number.isInteger(set.scoreB) ||
    set.scoreA < 0 ||
    set.scoreB < 0
  ) {
    throw new MatchResultValidationError('Los puntajes de los sets deben ser enteros no negativos');
  }
  if (set.scoreA === set.scoreB) {
    throw new MatchResultValidationError('Un set no puede terminar empatado');
  }
  const winnerScore = Math.max(set.scoreA, set.scoreB);
  const loserScore = Math.min(set.scoreA, set.scoreB);
  if (!winByTwo && winnerScore !== target) {
    throw new MatchResultValidationError(
      `El set sin alargue debe terminar exactamente en ${target} puntos`,
    );
  }
  if (winnerScore < target || (winByTwo && winnerScore - loserScore < 2)) {
    throw new MatchResultValidationError(
      winByTwo
        ? `El set debe llegar al menos a ${target} puntos y ganarse por diferencia de dos`
        : `El set debe llegar a ${target} puntos`,
    );
  }
}

function summarizeSets(sets: SetScore[]): {
  setsWonA: number;
  setsWonB: number;
  pointsA: number;
  pointsB: number;
} {
  return sets.reduce(
    (summary, set) => ({
      setsWonA: summary.setsWonA + Number(set.scoreA > set.scoreB),
      setsWonB: summary.setsWonB + Number(set.scoreB > set.scoreA),
      pointsA: summary.pointsA + set.scoreA,
      pointsB: summary.pointsB + set.scoreB,
    }),
    { setsWonA: 0, setsWonB: 0, pointsA: 0, pointsB: 0 },
  );
}

export function evaluateMatchResult(
  teamAId: string,
  teamBId: string,
  sets: SetScore[],
  phase: 'group' | 'knockout',
  rules: CompetitionRulesV1,
): EvaluatedMatchResult {
  const format =
    phase === 'group' ? rules.groupStage.matchFormat : rules.knockoutStage.matchFormat;
  const regularTarget =
    phase === 'group'
      ? rules.groupStage.regularSetPoints
      : rules.knockoutStage.regularSetPoints;
  const tiebreakTarget =
    phase === 'group'
      ? rules.groupStage.tiebreakSetPoints
      : rules.knockoutStage.tiebreakSetPoints;
  const winByTwo =
    phase === 'group'
      ? rules.groupStage.winByTwo
      : rules.knockoutStage.winByTwo;

  if (sets.length < 2 || sets.length > 3) {
    throw new MatchResultValidationError('El partido debe contener dos o tres sets completos');
  }
  sets.forEach((set, index) =>
    validateSet(
      set,
      index === 2 ? tiebreakTarget : regularTarget,
      winByTwo,
    ),
  );

  const summary = summarizeSets(sets);
  let winnerIsA: boolean;
  let split = false;

  if (format === 'best_of_three' || phase === 'knockout') {
    const firstTwo = summarizeSets(sets.slice(0, 2));
    const winnerSets = Math.max(summary.setsWonA, summary.setsWonB);
    if (
      sets.length === 3 &&
      (firstTwo.setsWonA !== 1 || firstTwo.setsWonB !== 1)
    ) {
      throw new MatchResultValidationError('El partido contiene sets adicionales');
    }
    if (winnerSets !== 2 || summary.setsWonA === summary.setsWonB) {
      throw new MatchResultValidationError(
        'El partido está incompleto: un equipo debe ganar exactamente dos sets',
      );
    }
    winnerIsA = summary.setsWonA > summary.setsWonB;
    split = sets.length === 3;
  } else {
    const firstTwo = summarizeSets(sets.slice(0, 2));
    if (sets.length === 2 && summary.setsWonA === summary.setsWonB) {
      if (summary.pointsA === summary.pointsB) {
        throw new MatchResultValidationError(
          'El empate exacto de puntos requiere un tercer set de desempate',
        );
      }
      winnerIsA = summary.pointsA > summary.pointsB;
      split = true;
    } else if (sets.length === 3) {
      if (
        firstTwo.setsWonA !== 1 ||
        firstTwo.setsWonB !== 1 ||
        firstTwo.pointsA !== firstTwo.pointsB
      ) {
        throw new MatchResultValidationError(
          'El tercer set solo se permite después de un empate exacto de puntos',
        );
      }
      winnerIsA = sets[2].scoreA > sets[2].scoreB;
      split = true;
    } else if (summary.setsWonA === 2 || summary.setsWonB === 2) {
      winnerIsA = summary.setsWonA > summary.setsWonB;
    } else {
      throw new MatchResultValidationError('El resultado del partido está incompleto');
    }
  }

  const points = rules.groupStage.standingsPoints;
  const winnerTablePoints =
    phase === 'group' ? (split ? points.splitWin : points.straightWin) : 0;
  const loserTablePoints =
    phase === 'group' ? (split ? points.splitLoss : points.straightLoss) : 0;

  return {
    winnerId: winnerIsA ? teamAId : teamBId,
    loserId: winnerIsA ? teamBId : teamAId,
    ...summary,
    tablePointsA: winnerIsA ? winnerTablePoints : loserTablePoints,
    tablePointsB: winnerIsA ? loserTablePoints : winnerTablePoints,
  };
}
