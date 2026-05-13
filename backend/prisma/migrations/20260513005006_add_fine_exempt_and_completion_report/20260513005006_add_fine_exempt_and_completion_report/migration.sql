-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'fine_exemption_toggled';

-- AlterTable
ALTER TABLE "game_registrations" ADD COLUMN     "fineExempt" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "completionReport" TEXT;
