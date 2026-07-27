import { Modalidad, Position } from '@prisma/client';
import {
  UnratedPlayersException,
  NotEnoughPlayersException,
  NotEnoughSettersException,
} from './exceptions';

/** Skill assigned to guests, who have no user account and thus no rating. */
export const DEFAULT_GUEST_SKILL = 2.5;

export const TEAM_SIZE: Record<Modalidad, number> = {
  seis_x_seis: 6,
  cuatro_x_cuatro: 4,
};

/** Number of teams always generated, regardless of modality or roster size. */
export const NUM_TEAMS = 3;

export interface TeamPlayer {
  registrationId: string;
  displayName: string;
  isGuest: boolean;
  /** Null for guests and unrated members. */
  skillLevel: number | null;
  positions: Position[];
}

export interface GeneratedTeam {
  teamNumber: number;
  players: TeamPlayer[];
  skillSum: number;
}

/** Random source, injectable for deterministic tests. Returns [0, 1). */
export type Rng = () => number;

function isSetter(player: TeamPlayer): boolean {
  return !player.isGuest && player.positions.includes(Position.armador);
}

function effectiveSkill(player: TeamPlayer): number {
  return player.isGuest ? DEFAULT_GUEST_SKILL : (player.skillLevel as number);
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Splits main-list players into balanced teams.
 *
 * Rules:
 * - Team size depends on modalidad (6 for 6x6, 4 for 4x4); as many full teams
 *   as the roster allows, leftovers spread round-robin (teams may end up +1).
 * - Every member must have a skill rating; guests play with a fixed 2.5.
 * - Each team gets at least one armador (setter). Guests never count as setters.
 * - Randomness (shuffle + tie-breaks) makes regeneration produce alternatives
 *   while staying balanced.
 */
export function generateBalancedTeams(
  players: TeamPlayer[],
  modalidad: Modalidad,
  rng: Rng = Math.random,
): GeneratedTeam[] {
  const unrated = players.filter((p) => !p.isGuest && p.skillLevel == null);
  if (unrated.length > 0) {
    throw new UnratedPlayersException(unrated.map((p) => p.displayName));
  }

  const teamSize = TEAM_SIZE[modalidad];
  const minPlayers = NUM_TEAMS * (teamSize - 1);
  if (players.length < minPlayers) {
    throw new NotEnoughPlayersException(minPlayers);
  }

  const teamCount = NUM_TEAMS;

  const setters = players.filter(isSetter);
  if (setters.length < teamCount) {
    throw new NotEnoughSettersException(teamCount, setters.length);
  }

  const teams: GeneratedTeam[] = Array.from({ length: teamCount }, (_, i) => ({
    teamNumber: i + 1,
    players: [],
    skillSum: 0,
  }));

  // 1) One setter per team. Shuffle first so equal-skill setters land on
  // different teams across regenerations, then sort by skill descending so the
  // strongest setters spread across teams (one each).
  const shuffledSetters = shuffle(setters, rng).sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
  const seededSetters = shuffledSetters.slice(0, teamCount);
  seededSetters.forEach((setter, i) => {
    teams[i].players.push(setter);
    teams[i].skillSum += effectiveSkill(setter);
  });

  const seededIds = new Set(seededSetters.map((s) => s.registrationId));
  const rest = shuffle(
    players.filter((p) => !seededIds.has(p.registrationId)),
    rng,
  ).sort((a, b) => effectiveSkill(b) - effectiveSkill(a));

  // 2) Greedy fill: each remaining player (strongest first) goes to the team
  // with the lowest skill sum that still has room. Ties in skill were already
  // randomized by the shuffle, so regeneration explores alternatives.
  const capacity = (t: GeneratedTeam) => t.players.length < teamSize;
  for (const player of rest) {
    const open = teams.filter(capacity);
    const target = open.length > 0
      ? open.reduce((min, t) => (t.skillSum < min.skillSum ? t : min))
      // 3) Leftovers (roster not divisible by team size): keep balancing by
      // total skill, allowing teams to exceed the nominal size by one.
      : teams.reduce((min, t) =>
          t.players.length < min.players.length || (t.players.length === min.players.length && t.skillSum < min.skillSum)
            ? t
            : min,
        );
    target.players.push(player);
    target.skillSum += effectiveSkill(player);
  }

  return teams;
}
