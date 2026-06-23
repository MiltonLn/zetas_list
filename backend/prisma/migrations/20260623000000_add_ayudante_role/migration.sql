-- Add 'ayudante' to the Role enum
-- PostgreSQL only allows adding values to an enum (not removing), so this is safe to run.
ALTER TYPE "Role" ADD VALUE 'ayudante';
