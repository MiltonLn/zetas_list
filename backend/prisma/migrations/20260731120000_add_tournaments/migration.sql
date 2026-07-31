-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('draft', 'registration_open', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('groups_and_knockout', 'knockout_only');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_status_changed';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_team_registered';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_team_removed';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'tournament_match_updated';

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "TournamentFormat" NOT NULL,
    "modalidad" "Modalidad" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'draft',
    "registrationOpenAt" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "pricePerTeam" INTEGER NOT NULL DEFAULT 0,
    "prizeDescription" TEXT,
    "maxTeams" INTEGER NOT NULL,
    "minPlayersPerTeam" INTEGER NOT NULL DEFAULT 4,
    "maxPlayersPerTeam" INTEGER NOT NULL DEFAULT 8,
    "minZetasMembers" INTEGER NOT NULL DEFAULT 0,
    "allowExternalTeams" BOOLEAN NOT NULL DEFAULT true,
    "numberOfGroups" INTEGER,
    "rules" TEXT,
    "rulesFileUrl" TEXT,
    "flyerUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "seed" INTEGER,
    "groupLabel" TEXT,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_players" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_matches" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "groupLabel" TEXT,
    "roundNumber" INTEGER NOT NULL,
    "matchOrder" INTEGER NOT NULL,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "winnerId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3),
    "court" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_sets" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,

    CONSTRAINT "tournament_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_status_startDate_idx" ON "tournaments"("status", "startDate");

-- CreateIndex
CREATE INDEX "tournament_teams_tournamentId_idx" ON "tournament_teams"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_players_teamId_idx" ON "tournament_players"("teamId");

-- CreateIndex
CREATE INDEX "tournament_matches_tournamentId_phase_idx" ON "tournament_matches"("tournamentId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_sets_matchId_setNumber_key" ON "tournament_sets"("matchId", "setNumber");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_sets" ADD CONSTRAINT "tournament_sets_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "tournament_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
