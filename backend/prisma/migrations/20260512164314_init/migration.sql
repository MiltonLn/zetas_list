-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'banned');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('auxiliar', 'libero', 'armador', 'central', 'opuesto');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('masculino', 'femenino', 'otro');

-- CreateEnum
CREATE TYPE "Modalidad" AS ENUM ('seis_x_seis', 'cuatro_x_cuatro', 'torneo');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('scheduled', 'registration_open', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('player_registered', 'player_removed', 'player_promoted', 'player_reordered', 'attendance_toggled', 'payment_toggled', 'note_updated', 'game_created', 'game_updated', 'game_cancelled', 'game_completed', 'game_status_changed', 'user_created', 'user_updated', 'user_status_changed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "position" "Position",
    "gender" "Gender",
    "heightCm" INTEGER,
    "birthDate" TIMESTAMP(3),
    "photoUrl" TEXT,
    "bio" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "banReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "modalidad" "Modalidad" NOT NULL,
    "gameDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '19:50',
    "registrationOpenAt" TIMESTAMP(3) NOT NULL,
    "maxMainSpots" INTEGER NOT NULL,
    "pricePerPlayer" INTEGER NOT NULL DEFAULT 2000,
    "vigilante" INTEGER NOT NULL DEFAULT 10000,
    "status" "GameStatus" NOT NULL DEFAULT 'scheduled',
    "cancellationReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_registrations" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isWaitingList" BOOLEAN NOT NULL DEFAULT false,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "fromWaitList" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredById" TEXT NOT NULL,

    CONSTRAINT "game_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "game_registrations_gameId_userId_key" ON "game_registrations"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_registrations_gameId_position_isWaitingList_key" ON "game_registrations"("gameId", "position", "isWaitingList");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_registrations" ADD CONSTRAINT "game_registrations_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_registrations" ADD CONSTRAINT "game_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_registrations" ADD CONSTRAINT "game_registrations_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
