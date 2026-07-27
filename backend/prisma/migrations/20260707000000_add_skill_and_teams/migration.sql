-- Skill level (0.0 to 5.0, one decimal): admin-only rating used to balance teams.
ALTER TABLE "users" ADD COLUMN "skillLevel" DECIMAL(2,1);

-- Players can now play more than one position: single enum column becomes an array.
-- Existing values are preserved as one-element arrays.
ALTER TABLE "users" ADD COLUMN "positions" "Position"[] NOT NULL DEFAULT ARRAY[]::"Position"[];
UPDATE "users" SET "positions" = ARRAY["position"]::"Position"[] WHERE "position" IS NOT NULL;
ALTER TABLE "users" DROP COLUMN "position";

-- Team assignment per game registration (null = no team assigned yet).
ALTER TABLE "game_registrations" ADD COLUMN "teamNumber" INTEGER;

-- Audit actions for team generation and WhatsApp send.
ALTER TYPE "AuditAction" ADD VALUE 'teams_generated';
ALTER TYPE "AuditAction" ADD VALUE 'teams_sent';
