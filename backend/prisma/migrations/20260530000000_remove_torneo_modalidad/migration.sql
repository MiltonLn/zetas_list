-- Convert any existing 'torneo' games to 'seis_x_seis' before removing the enum value
UPDATE "games" SET "modalidad" = 'seis_x_seis' WHERE "modalidad" = 'torneo';

-- Remove 'torneo' from Modalidad enum
ALTER TYPE "Modalidad" RENAME TO "Modalidad_old";
CREATE TYPE "Modalidad" AS ENUM ('seis_x_seis', 'cuatro_x_cuatro');
ALTER TABLE "games" ALTER COLUMN "modalidad" TYPE "Modalidad" USING "modalidad"::text::"Modalidad";
DROP TYPE "Modalidad_old";
