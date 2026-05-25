-- AlterTable
ALTER TABLE "users" ADD COLUMN "whatsappLid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_whatsappLid_key" ON "users"("whatsappLid");
