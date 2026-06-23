import { PrismaClient, Role, UserStatus, TournamentFormat, TournamentStatus, Modalidad, MatchStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PREFIX = 'testplayer';
const TEST_PASSWORD = 'Test1234!';
const TEST_PHONE_PREFIX = '999000';

const TOURNAMENT_8_NAME = '[TEST] Torneo 8 Equipos';
const TOURNAMENT_4_NAME = '[TEST] Torneo 4 Equipos';
const TOURNAMENT_4_LIVE_NAME = '[TEST] Torneo 4 Equipos — En Curso';
const TOURNAMENT_8_LIVE_NAME = '[TEST] Torneo 8 Equipos — En Curso';

// Tournaments reuse the same player pool (64 players covers all cases)
const PLAYERS_NEEDED = 64;

function parseArgs(): { cleanup: boolean } {
  const args = process.argv.slice(2);
  return { cleanup: args.includes('--cleanup') };
}

async function ensurePlayers(): Promise<Array<{ id: string; username: string }>> {
  console.log(`\n👥 Verificando ${PLAYERS_NEEDED} jugadores de prueba...\n`);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const players: Array<{ id: string; username: string }> = [];

  for (let i = 1; i <= PLAYERS_NEEDED; i++) {
    const username = `${TEST_PREFIX}${i}`;
    const existing = await prisma.user.findUnique({ where: { username } });

    if (existing) {
      players.push({ id: existing.id, username });
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
      },
    });

    console.log(`  ✓ Creado: ${user.username} — ${user.name}`);
    players.push({ id: user.id, username: user.username });
  }

  console.log(`  ✓ ${players.length} jugadores listos.`);
  return players;
}

async function getOrCreateAdmin(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: Role.admin } });
  if (admin) return admin.id;

  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const created = await prisma.user.create({
    data: {
      username: '573100000000',
      passwordHash,
      name: 'Admin Seed',
      phone: '573100000000',
      role: Role.admin,
      status: UserStatus.active,
      mustChangePassword: false,
    },
  });
  return created.id;
}

// Tournament 1: 8 teams, groups_and_knockout, 2 groups, 8 players/team
async function seedTournament8(players: Array<{ id: string }>, adminId: string) {
  console.log('\n🏆 Creando torneo de 8 equipos (groups_and_knockout, 2 grupos)...\n');

  const existing = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_8_NAME } });
  if (existing) {
    console.log(`  ⚠ Ya existe: ${TOURNAMENT_8_NAME} (id: ${existing.id})`);
    return existing;
  }

  const now = new Date();
  const tournament = await prisma.tournament.create({
    data: {
      name: TOURNAMENT_8_NAME,
      format: TournamentFormat.groups_and_knockout,
      modalidad: Modalidad.seis_x_seis,
      status: TournamentStatus.registration_open,
      registrationOpenAt: now,
      startDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      pricePerTeam: 0,
      maxTeams: 8,
      minPlayersPerTeam: 6,
      maxPlayersPerTeam: 8,
      minZetasMembers: 0,
      allowExternalTeams: true,
      numberOfGroups: 2,
      createdById: adminId,
    },
  });

  console.log(`  ✓ Torneo creado: ${tournament.name} (id: ${tournament.id})`);

  // 8 teams × 8 players (players 0–63)
  for (let t = 0; t < 8; t++) {
    const teamPlayers = players.slice(t * 8, t * 8 + 8);
    const team = await prisma.tournamentTeam.create({
      data: {
        tournamentId: tournament.id,
        name: `Equipo Test ${t + 1}`,
        registeredById: adminId,
        players: {
          create: teamPlayers.map((p, idx) => ({
            userId: p.id,
            isCaptain: idx === 0,
          })),
        },
      },
    });
    console.log(`  ✓ Equipo ${t + 1} registrado (8 jugadores) — id: ${team.id}`);
  }

  return tournament;
}

// Tournament 2: 4 teams, knockout_only, 8 players/team, min 6
async function seedTournament4(players: Array<{ id: string }>, adminId: string) {
  console.log('\n🏆 Creando torneo de 4 equipos (knockout_only)...\n');

  const existing = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_4_NAME } });
  if (existing) {
    console.log(`  ⚠ Ya existe: ${TOURNAMENT_4_NAME} (id: ${existing.id})`);
    return existing;
  }

  const now = new Date();
  const tournament = await prisma.tournament.create({
    data: {
      name: TOURNAMENT_4_NAME,
      format: TournamentFormat.knockout_only,
      modalidad: Modalidad.cuatro_x_cuatro,
      status: TournamentStatus.registration_open,
      registrationOpenAt: now,
      startDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      pricePerTeam: 0,
      maxTeams: 4,
      minPlayersPerTeam: 6,
      maxPlayersPerTeam: 8,
      minZetasMembers: 0,
      allowExternalTeams: true,
      createdById: adminId,
    },
  });

  console.log(`  ✓ Torneo creado: ${tournament.name} (id: ${tournament.id})`);

  // 4 teams × 8 players (reuse players 0–31)
  for (let t = 0; t < 4; t++) {
    const teamPlayers = players.slice(t * 8, t * 8 + 8);
    const team = await prisma.tournamentTeam.create({
      data: {
        tournamentId: tournament.id,
        name: `Equipo Test ${t + 1}`,
        registeredById: adminId,
        players: {
          create: teamPlayers.map((p, idx) => ({
            userId: p.id,
            isCaptain: idx === 0,
          })),
        },
      },
    });
    console.log(`  ✓ Equipo ${t + 1} registrado (8 jugadores) — id: ${team.id}`);
  }

  return tournament;
}

// Helper: create a match with sets and mark it completed
async function createCompletedMatch(opts: {
  tournamentId: string;
  phase: string;
  groupLabel: string | null;
  roundNumber: number;
  matchOrder: number;
  teamAId: string;
  teamBId: string;
  sets: Array<[number, number]>; // [scoreA, scoreB] per set
  winnerId: string;
}) {
  const match = await prisma.tournamentMatch.create({
    data: {
      tournamentId: opts.tournamentId,
      phase: opts.phase,
      groupLabel: opts.groupLabel,
      roundNumber: opts.roundNumber,
      matchOrder: opts.matchOrder,
      teamAId: opts.teamAId,
      teamBId: opts.teamBId,
      winnerId: opts.winnerId,
      status: MatchStatus.completed,
    },
  });
  for (let i = 0; i < opts.sets.length; i++) {
    await prisma.tournamentSet.create({
      data: { matchId: match.id, setNumber: i + 1, scoreA: opts.sets[i][0], scoreB: opts.sets[i][1] },
    });
  }
  return match;
}

// Tournament 3: 4 teams, knockout_only, 1 group (en curso, resultados completos)
async function seedTournament4Live(players: Array<{ id: string }>, adminId: string) {
  console.log('\n🏆 Creando torneo 4 equipos EN CURSO con resultados...\n');

  const existing = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_4_LIVE_NAME } });
  if (existing) {
    console.log(`  ⚠ Ya existe: ${TOURNAMENT_4_LIVE_NAME} (id: ${existing.id})`);
    return existing;
  }

  const now = new Date();
  const tournament = await prisma.tournament.create({
    data: {
      name: TOURNAMENT_4_LIVE_NAME,
      format: TournamentFormat.knockout_only,
      modalidad: Modalidad.cuatro_x_cuatro,
      status: TournamentStatus.in_progress,
      registrationOpenAt: new Date(now.getTime() - 14 * 86400000),
      startDate: new Date(now.getTime() - 7 * 86400000),
      endDate: new Date(now.getTime() + 7 * 86400000),
      pricePerTeam: 60000,
      prizeDescription: 'Pizza y gaseosa',
      maxTeams: 4,
      minPlayersPerTeam: 6,
      maxPlayersPerTeam: 8,
      minZetasMembers: 0,
      allowExternalTeams: true,
      createdById: adminId,
    },
  });

  console.log(`  ✓ Torneo creado: ${tournament.name}`);

  // 4 teams: reuse players 0–31
  const teamIds: string[] = [];
  for (let t = 0; t < 4; t++) {
    const team = await prisma.tournamentTeam.create({
      data: {
        tournamentId: tournament.id,
        name: `Equipo ${['Alfa', 'Beta', 'Gamma', 'Delta'][t]}`,
        registeredById: adminId,
        players: {
          create: players.slice(t * 8, t * 8 + 8).map((p, idx) => ({
            userId: p.id,
            isCaptain: idx === 0,
          })),
        },
      },
    });
    teamIds.push(team.id);
    console.log(`  ✓ Equipo ${team.name} creado`);
  }

  const [alfa, beta, gamma, delta] = teamIds;

  // Semis: Alfa vs Delta → Alfa wins 2-0 | Beta vs Gamma → Gamma wins 2-1
  await createCompletedMatch({
    tournamentId: tournament.id,
    phase: 'semifinal', groupLabel: null, roundNumber: 1, matchOrder: 1,
    teamAId: alfa, teamBId: delta, winnerId: alfa,
    sets: [[25, 18], [25, 20]],
  });
  await createCompletedMatch({
    tournamentId: tournament.id,
    phase: 'semifinal', groupLabel: null, roundNumber: 1, matchOrder: 2,
    teamAId: beta, teamBId: gamma, winnerId: gamma,
    sets: [[22, 25], [25, 20], [15, 10]],
  });

  // Final: Alfa vs Gamma → Gamma wins 2-1
  await createCompletedMatch({
    tournamentId: tournament.id,
    phase: 'final', groupLabel: null, roundNumber: 2, matchOrder: 1,
    teamAId: alfa, teamBId: gamma, winnerId: gamma,
    sets: [[25, 22], [20, 25], [12, 15]],
  });

  // Tercer puesto: Beta vs Delta → cancelled (no se jugó)
  await prisma.tournamentMatch.create({
    data: {
      tournamentId: tournament.id,
      phase: 'third_place', groupLabel: null, roundNumber: 2, matchOrder: 2,
      teamAId: beta, teamBId: delta, status: 'cancelled' as MatchStatus,
    },
  });

  console.log('  ✓ Partidos y resultados creados');
  return tournament;
}

// Tournament 4: 8 teams, groups_and_knockout, 2 groups (en curso, resultados completos)
async function seedTournament8Live(players: Array<{ id: string }>, adminId: string) {
  console.log('\n🏆 Creando torneo 8 equipos EN CURSO con resultados...\n');

  const existing = await prisma.tournament.findFirst({ where: { name: TOURNAMENT_8_LIVE_NAME } });
  if (existing) {
    console.log(`  ⚠ Ya existe: ${TOURNAMENT_8_LIVE_NAME} (id: ${existing.id})`);
    return existing;
  }

  const now = new Date();
  const tournament = await prisma.tournament.create({
    data: {
      name: TOURNAMENT_8_LIVE_NAME,
      format: TournamentFormat.groups_and_knockout,
      modalidad: Modalidad.seis_x_seis,
      status: TournamentStatus.in_progress,
      registrationOpenAt: new Date(now.getTime() - 21 * 86400000),
      startDate: new Date(now.getTime() - 7 * 86400000),
      endDate: new Date(now.getTime() + 14 * 86400000),
      pricePerTeam: 180000,
      prizeDescription: 'Trofeo + $500k',
      maxTeams: 8,
      minPlayersPerTeam: 6,
      maxPlayersPerTeam: 8,
      minZetasMembers: 0,
      allowExternalTeams: true,
      numberOfGroups: 2,
      createdById: adminId,
    },
  });

  console.log(`  ✓ Torneo creado: ${tournament.name}`);

  const teamNames = ['Lobos', 'Águilas', 'Tigres', 'Cóndores', 'Leones', 'Panteras', 'Halcones', 'Cobras'];
  const groups = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']; // first 4 → group A, next 4 → group B

  const teamIds: string[] = [];
  for (let t = 0; t < 8; t++) {
    const team = await prisma.tournamentTeam.create({
      data: {
        tournamentId: tournament.id,
        name: teamNames[t],
        groupLabel: groups[t],
        registeredById: adminId,
        players: {
          create: players.slice(t * 8, t * 8 + 8).map((p, idx) => ({
            userId: p.id,
            isCaptain: idx === 0,
          })),
        },
      },
    });
    teamIds.push(team.id);
    console.log(`  ✓ Equipo ${team.name} (Grupo ${groups[t]})`);
  }

  const [lobos, aguilas, tigres, condores, leones, panteras, halcones, cobras] = teamIds;

  // ── Grupo A: todos contra todos (6 partidos) ──
  // Lobos vs Águilas → Lobos 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 1, matchOrder: 1, teamAId: lobos, teamBId: aguilas, winnerId: lobos, sets: [[25, 20], [25, 18]] });
  // Tigres vs Cóndores → Cóndores 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 1, matchOrder: 2, teamAId: tigres, teamBId: condores, winnerId: condores, sets: [[22, 25], [25, 20], [12, 15]] });
  // Lobos vs Tigres → Lobos 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 2, matchOrder: 1, teamAId: lobos, teamBId: tigres, winnerId: lobos, sets: [[25, 15], [25, 19]] });
  // Águilas vs Cóndores → Águilas 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 2, matchOrder: 2, teamAId: aguilas, teamBId: condores, winnerId: aguilas, sets: [[25, 22], [18, 25], [15, 12]] });
  // Lobos vs Cóndores → Lobos 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 3, matchOrder: 1, teamAId: lobos, teamBId: condores, winnerId: lobos, sets: [[25, 17], [25, 21]] });
  // Águilas vs Tigres → Águilas 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'A', roundNumber: 3, matchOrder: 2, teamAId: aguilas, teamBId: tigres, winnerId: aguilas, sets: [[25, 20], [25, 22]] });

  // ── Grupo B: todos contra todos (6 partidos) ──
  // Leones vs Panteras → Panteras 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 1, matchOrder: 3, teamAId: leones, teamBId: panteras, winnerId: panteras, sets: [[25, 22], [20, 25], [13, 15]] });
  // Halcones vs Cobras → Halcones 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 1, matchOrder: 4, teamAId: halcones, teamBId: cobras, winnerId: halcones, sets: [[25, 19], [25, 21]] });
  // Leones vs Halcones → Leones 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 2, matchOrder: 3, teamAId: leones, teamBId: halcones, winnerId: leones, sets: [[22, 25], [25, 20], [15, 12]] });
  // Panteras vs Cobras → Panteras 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 2, matchOrder: 4, teamAId: panteras, teamBId: cobras, winnerId: panteras, sets: [[25, 14], [25, 18]] });
  // Leones vs Cobras → Leones 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 3, matchOrder: 3, teamAId: leones, teamBId: cobras, winnerId: leones, sets: [[25, 16], [25, 20]] });
  // Panteras vs Halcones → Panteras 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'group', groupLabel: 'B', roundNumber: 3, matchOrder: 4, teamAId: panteras, teamBId: halcones, winnerId: panteras, sets: [[25, 23], [21, 25], [15, 11]] });

  // Clasificación: Grupo A → 1°Lobos, 2°Águilas | Grupo B → 1°Panteras, 2°Leones

  // ── Fase eliminatoria ──
  // Semis: Lobos vs Leones → Lobos 2-0 | Panteras vs Águilas → Panteras 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'semifinal', groupLabel: null, roundNumber: 4, matchOrder: 1, teamAId: lobos, teamBId: leones, winnerId: lobos, sets: [[25, 19], [25, 21]] });
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'semifinal', groupLabel: null, roundNumber: 4, matchOrder: 2, teamAId: panteras, teamBId: aguilas, winnerId: panteras, sets: [[25, 22], [20, 25], [15, 13]] });

  // Final: Lobos vs Panteras → Panteras 2-1
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'final', groupLabel: null, roundNumber: 5, matchOrder: 1, teamAId: lobos, teamBId: panteras, winnerId: panteras, sets: [[25, 22], [18, 25], [14, 16]] });

  // Tercer puesto: Leones vs Águilas → Leones 2-0
  await createCompletedMatch({ tournamentId: tournament.id, phase: 'third_place', groupLabel: null, roundNumber: 5, matchOrder: 2, teamAId: leones, teamBId: aguilas, winnerId: leones, sets: [[25, 20], [25, 22]] });

  console.log('  ✓ Partidos y resultados creados');
  return tournament;
}

async function cleanup() {
  console.log('\n🧹 Limpiando torneos de prueba...\n');

  const tournaments = await prisma.tournament.findMany({
    where: { name: { startsWith: '[TEST]' } },
    select: { id: true, name: true },
  });

  if (tournaments.length === 0) {
    console.log('  No hay torneos de prueba para eliminar.');
    return;
  }

  for (const t of tournaments) {
    await prisma.tournament.delete({ where: { id: t.id } });
    console.log(`  ✓ Eliminado: ${t.name}`);
  }

  console.log('\n✅ Limpieza completada.');
}

async function main() {
  const { cleanup: doCleanup } = parseArgs();

  if (doCleanup) {
    await cleanup();
    return;
  }

  const adminId = await getOrCreateAdmin();
  const players = await ensurePlayers();

  const t8 = await seedTournament8(players, adminId);
  const t4 = await seedTournament4(players, adminId);
  const t4live = await seedTournament4Live(players, adminId);
  const t8live = await seedTournament8Live(players, adminId);

  console.log('\n✅ Seed de torneos completado.');
  console.log('');
  console.log('📋 Resumen:');
  console.log(`  🏆 ${TOURNAMENT_8_NAME} (groups_and_knockout, 2 grupos): id: ${t8.id}`);
  console.log(`  🏆 ${TOURNAMENT_4_NAME} (knockout_only):                  id: ${t4.id}`);
  console.log(`  🏆 ${TOURNAMENT_4_LIVE_NAME} (en curso, resultados):       id: ${t4live.id}`);
  console.log(`  🏆 ${TOURNAMENT_8_LIVE_NAME} (en curso, resultados):       id: ${t8live.id}`);
  console.log('');
  console.log(`  🔑 Contraseña jugadores: ${TEST_PASSWORD}`);
  console.log('');
  console.log('  Para limpiar: npm run seed:tournaments -- --cleanup');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
