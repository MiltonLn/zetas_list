-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'guest_registered';
ALTER TYPE "AuditAction" ADD VALUE 'proxy_registered';
ALTER TYPE "AuditAction" ADD VALUE 'confirmation_requested';
ALTER TYPE "AuditAction" ADD VALUE 'confirmation_received';
ALTER TYPE "AuditAction" ADD VALUE 'confirmation_expired';

-- DropForeignKey
ALTER TABLE "game_registrations" DROP CONSTRAINT "game_registrations_userId_fkey";

-- AlterTable
ALTER TABLE "game_registrations" ADD COLUMN     "confirmationDeadline" TIMESTAMP(3),
ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalWaitPosition" INTEGER,
ADD COLUMN     "pendingConfirmation" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "cutoffNotified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "guestCutoffTime" TEXT NOT NULL DEFAULT '13:30',
ADD COLUMN     "mainListHasBeenFull" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxProxyRegistrations" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "game_registrations_gameId_isWaitingList_position_idx" ON "game_registrations"("gameId", "isWaitingList", "position");

-- CreateIndex
CREATE INDEX "game_registrations_pendingConfirmation_confirmationDeadline_idx" ON "game_registrations"("pendingConfirmation", "confirmationDeadline");

-- AddForeignKey
ALTER TABLE "game_registrations" ADD CONSTRAINT "game_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace the unique constraint with a partial unique index (allows multiple NULL userIds for guests)
DROP INDEX IF EXISTS "game_registrations_gameId_userId_key";
CREATE UNIQUE INDEX "game_registrations_gameId_userId_key" ON "game_registrations"("gameId", "userId") WHERE "userId" IS NOT NULL;
