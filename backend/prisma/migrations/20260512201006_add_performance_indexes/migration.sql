-- CreateIndex
CREATE INDEX "audit_logs_gameId_createdAt_idx" ON "audit_logs"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "games_status_registrationOpenAt_idx" ON "games"("status", "registrationOpenAt");

-- CreateIndex
CREATE INDEX "games_gameDate_status_idx" ON "games"("gameDate", "status");
