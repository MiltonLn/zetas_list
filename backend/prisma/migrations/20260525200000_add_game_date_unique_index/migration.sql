-- Enforce one active game per day (only games that are not cancelled or completed)
CREATE UNIQUE INDEX "games_gameDate_active_unique"
ON "games" ("gameDate")
WHERE status NOT IN ('cancelled', 'completed');
