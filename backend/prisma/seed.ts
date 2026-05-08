import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMINS = [
  {
    username: 'yamijuan',
    name: 'Juan Diego García',
    phone: process.env.SEED_PHONE_YAMIJUAN || '0000000001',
  },
  {
    username: 'MiltonLn',
    name: 'Milton Lenis',
    phone: process.env.SEED_PHONE_MILTONLN || '0000000002',
  },
];

async function upsertAdmin(data: { username: string; name: string; phone: string }) {
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) {
    console.log(`  ✓ Ya existe: ${data.username}`);
    return existing;
  }

  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const user = await prisma.user.create({
    data: {
      username: data.username,
      passwordHash,
      name: data.name,
      phone: data.phone,
      role: Role.admin,
      status: UserStatus.active,
    },
  });

  console.log(`  ✓ Creado: ${user.username} — ${user.name} (${user.id})`);
  return user;
}

async function main() {
  console.log('🌱 Iniciando seed de administradores...\n');

  for (const admin of ADMINS) {
    await upsertAdmin(admin);
  }

  console.log('\n✅ Seed completado.');
  console.log('🔑 Contraseña inicial de todos los admins: Admin1234!');
  console.log('⚠️  Recuerda actualizar los números de teléfono reales en la app.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
