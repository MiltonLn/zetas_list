import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMINS = [
  {
    name: 'Juan Diego García',
    phone: '573192352624',
  },
  {
    name: 'Milton Lenis',
    phone: '573166160159',
  },
];

async function upsertAdmin(data: { name: string; phone: string }) {
  const username = data.phone;

  const existingByPhone = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existingByPhone) {
    if (existingByPhone.username !== username) {
      await prisma.user.update({
        where: { id: existingByPhone.id },
        data: { username },
      });
      console.log(`  ✓ Username actualizado: ${existingByPhone.username} → ${username}`);
    } else {
      console.log(`  ✓ Ya existe: ${data.name} (${data.phone})`);
    }
    return existingByPhone;
  }

  const existingByUsername = await prisma.user.findUnique({ where: { username } });
  if (existingByUsername) {
    console.log(`  ✓ Ya existe con username: ${username}`);
    return existingByUsername;
  }

  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      name: data.name,
      phone: data.phone,
      role: Role.admin,
      status: UserStatus.active,
      mustChangePassword: false,
    },
  });

  console.log(`  ✓ Creado: ${user.name} — phone: ${user.phone} (${user.id})`);
  return user;
}

async function migrateExistingUsernames() {
  const usersWithOldUsername = await prisma.user.findMany({
    where: {
      NOT: { phone: '' },
    },
    select: { id: true, username: true, phone: true, name: true },
  });

  let migrated = 0;
  for (const user of usersWithOldUsername) {
    const expectedUsername = user.phone;
    if (user.username !== expectedUsername) {
      const conflict = await prisma.user.findUnique({ where: { username: expectedUsername } });
      if (conflict && conflict.id !== user.id) {
        console.log(`  ⚠ No se pudo migrar ${user.name}: username ${expectedUsername} ya en uso por otro usuario`);
        continue;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { username: expectedUsername },
      });
      console.log(`  ✓ Migrado: ${user.name} — ${user.username} → ${expectedUsername}`);
      migrated++;
    }
  }
  if (migrated === 0) {
    console.log('  ✓ Todos los usernames ya están en formato de teléfono');
  }
  return migrated;
}

async function main() {
  console.log('🌱 Seed de administradores...\n');

  for (const admin of ADMINS) {
    await upsertAdmin(admin);
  }

  console.log('\n🔄 Migrando usernames al formato de teléfono...\n');
  await migrateExistingUsernames();

  console.log('\n✅ Seed completado.');
  console.log('🔑 Contraseña inicial de admins nuevos: Admin1234!');
  console.log('📱 Los usuarios se loguean con su número de teléfono como usuario.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
