-- Add optional alias field to users table
-- The alias is the display name shown in game lists; if null, the real name is used.
ALTER TABLE "users" ADD COLUMN "alias" TEXT;
