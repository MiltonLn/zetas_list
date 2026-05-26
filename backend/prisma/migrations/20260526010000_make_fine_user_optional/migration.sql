-- AlterTable: make userId nullable and add userName field for unlinked fines
ALTER TABLE "fines" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "fines" ADD COLUMN "userName" TEXT;
