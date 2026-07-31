-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'league_and_knockout';

-- AlterTable
ALTER TABLE "tournaments"
ADD COLUMN "competitionRules" JSONB NOT NULL DEFAULT
'{"version":1,"groupStage":{"matchFormat":"best_of_three","qualifiersPerGroup":2,"standingsPoints":{"straightWin":3,"splitWin":2,"splitLoss":1,"straightLoss":0},"tiebreakers":["wins","setDifference","pointDifference","headToHead"],"regularSetPoints":25,"tiebreakSetPoints":15},"knockoutStage":{"matchFormat":"best_of_three","regularSetPoints":25,"tiebreakSetPoints":15,"includeThirdPlace":true,"pairingStrategy":"cross_group"}}'::jsonb;

-- Backfill explicitly for databases where the column was introduced without its default.
UPDATE "tournaments"
SET "competitionRules" =
'{"version":1,"groupStage":{"matchFormat":"best_of_three","qualifiersPerGroup":2,"standingsPoints":{"straightWin":3,"splitWin":2,"splitLoss":1,"straightLoss":0},"tiebreakers":["wins","setDifference","pointDifference","headToHead"],"regularSetPoints":25,"tiebreakSetPoints":15},"knockoutStage":{"matchFormat":"best_of_three","regularSetPoints":25,"tiebreakSetPoints":15,"includeThirdPlace":true,"pairingStrategy":"cross_group"}}'::jsonb
WHERE "competitionRules" IS NULL;

UPDATE "tournaments"
SET "competitionRules" = jsonb_set(
  "competitionRules",
  '{knockoutStage,pairingStrategy}',
  '"high_low"'::jsonb
)
WHERE "format" = 'knockout_only';
