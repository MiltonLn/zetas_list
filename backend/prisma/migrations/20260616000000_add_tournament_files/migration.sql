-- AlterTable: add optional file URL columns to tournaments
ALTER TABLE "tournaments" ADD COLUMN "rulesFileUrl" TEXT;
ALTER TABLE "tournaments" ADD COLUMN "flyerUrl" TEXT;
