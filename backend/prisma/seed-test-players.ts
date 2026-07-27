import { PrismaClient, Position, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PREFIX = 'testplayer';
const TEST_PASSWORD = 'Test1234!';
const TEST_PHONE_PREFIX = '999000';

/**
 * Attributes assigned to each test player by index (1-based, cyclical).
 * Ensures at least 4 armadores in every batch of 18, enough to form 3 teams.
 */
interface PlayerProfile {
  skillLevel: number;
  positions: Position[];
}

const PLAYER_PROFILES: PlayerProfile[] = [
  { skillLevel: 5.0, positions: [Position.armador] },
  { skillLevel: 4.5, positions: [Position.central] },
  { skillLevel: 4.0, positions: [Position.opuesto] },
  { skillLevel: 3.5, positions: [Position.armador] },
  { skillLevel: 3.0, positions: [Position.auxiliar] },
  { skillLevel: 2.5, positions: [Position.libero] },
  { skillLevel: 2.0, positions: [Position.central] },
  { skillLevel: 1.5, positions: [Position.auxiliar] },
  { skillLevel: 4.0, positions: [Position.armador, Position.opuesto] },
  { skillLevel: 3.5, positions: [Position.central, Position.auxiliar] },
  { skillLevel: 3.0, positions: [Position.armador] },
  { skillLevel: 2.5, positions: [Position.libero] },
  { skillLevel: 4.5, positions: [Position.opuesto] },
  { skillLevel: 2.0, positions: [Position.auxiliar] },
  { skillLevel: 3.5, positions: [Position.central] },
  { skillLevel: 1.5, positions: [Position.auxiliar] },
  { skillLevel: 5.0, positions: [Position.armador] },
  { skillLevel: 3.0, positions: [Position.opuesto, Position.central] },
];

function profileFor(i: number): PlayerProfile {
  return PLAYER_PROFILES[(i - 1) % PLAYER_PROFILES.length];
}

function parseArgs(): { count: number; gameId?: string; cleanup: boolean } {
  const args = process.argv.slice(2);
  let count = 20;
  let gameId: string | undefined;
  let cleanup = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--gameId' && args[i + 1]) {
      gameId = args[i + 1];
      i++;
    } else if (args[i] === '--cleanup') {
      cleanup = true;
    }
  }

  return { count, gameId, cleanup };
}

async function cleanup() {
  console.log('🧹 Limpiando jugadores de prueba...\n');

  const testUsers = await prisma.user.findMany({
    where: { username: { startsWith: TEST_PREFIX } },
    select: { id: true, username: true },
  });

  if (testUsers.length === 0) {
    console.log('  No hay jugadores de prueba para eliminar.');
    return;
  }

  const userIds = testUsers.map((u) => u.id);

  const deletedRegs = await prisma.gameRegistration.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`  ✓ ${deletedRegs.count} registraciones eliminadas`);

  const deletedAudits = await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { targetUserId: { in: userIds } }] },
  });
  console.log(`  ✓ ${deletedAudits.count} logs de auditoría eliminados`);

  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
  console.log(`  ✓ ${deletedUsers.count} usuarios eliminados`);

  console.log('\n✅ Limpieza completada.');
}

async function seedPlayers(count: number, gameId?: string) {
  console.log(`🌱 Creando ${count} jugadores de prueba...\n`);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const created: Array<{ id: string; username: string }> = [];

  for (let i = 1; i <= count; i++) {
    const username = `${TEST_PREFIX}${i}`;
    const existing = await prisma.user.findUnique({ where: { username } });

    const profile = profileFor(i);

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { skillLevel: profile.skillLevel, positions: profile.positions },
      });
      console.log(`  → Actualizado: ${username} (skill=${profile.skillLevel}, pos=${profile.positions.join(',')})`);
      created.push({ id: existing.id, username });
      continue;
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name: `Jugador Test ${i}`,
        phone: `${TEST_PHONE_PREFIX}${String(i).padStart(4, '0')}`,
        role: Role.member,
        status: UserStatus.active,
        mustChangePassword: false,
        skillLevel: profile.skillLevel,
        positions: profile.positions,
      },
    });

    console.log(`  ✓ Creado: ${user.username} — ${user.name} (skill=${profile.skillLevel}, pos=${profile.positions.join(',')})`);
    created.push({ id: user.id, username: user.username });
  }

  console.log(`\n✅ ${created.length} jugadores listos.`);
  console.log(`🔑 Contraseña: ${TEST_PASSWORD}`);

  if (!gameId) return;

  console.log(`\n⚽ Registrando jugadores en partido ${gameId}...\n`);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, status: true, maxMainSpots: true },
  });

  if (!game) {
    console.error('❌ Partido no encontrado.');
    process.exit(1);
  }

  if (game.status !== 'registration_open' && game.status !== 'in_progress') {
    console.error(`❌ El partido está en estado "${game.status}", no se puede registrar.`);
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({ where: { role: Role.admin } });
  if (!admin) {
    console.error('❌ No se encontró un admin para registrar jugadores.');
    process.exit(1);
  }

  let mainCount = await prisma.gameRegistration.count({
    where: { gameId, isWaitingList: false },
  });
  let waitCount = await prisma.gameRegistration.count({
    where: { gameId, isWaitingList: true },
  });

  let registeredMain = 0;
  let registeredWait = 0;
  let skipped = 0;

  for (const player of created) {
    const existing = await prisma.gameRegistration.findUnique({
      where: { gameId_userId: { gameId, userId: player.id } },
    });

    if (existing) {
      console.log(`  → Ya registrado: ${player.username}`);
      skipped++;
      continue;
    }

    const isWaitingList = mainCount >= game.maxMainSpots;
    const currentListCount = isWaitingList ? waitCount : mainCount;
    const position = currentListCount + 1;

    await prisma.gameRegistration.create({
      data: {
        gameId,
        userId: player.id,
        position,
        isWaitingList,
        registeredAt: new Date(),
        registeredById: admin.id,
      },
    });

    if (isWaitingList) {
      waitCount++;
      registeredWait++;
      console.log(`  ⏳ Lista de espera (#${position}): ${player.username}`);
    } else {
      mainCount++;
      registeredMain++;
      console.log(`  ✓ Lista principal (#${position}): ${player.username}`);
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`  Lista principal: ${registeredMain} nuevos (${mainCount}/${game.maxMainSpots} total)`);
  console.log(`  Lista de espera: ${registeredWait} nuevos (${waitCount} total)`);
  if (skipped > 0) console.log(`  Omitidos (ya registrados): ${skipped}`);
  console.log('');
}

async function main() {
  const { count, gameId, cleanup: doCleanup } = parseArgs();

  if (doCleanup) {
    await cleanup();
  } else {
    await seedPlayers(count, gameId);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
