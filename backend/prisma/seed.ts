import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.admin },
  });

  if (existingAdmin) {
    console.log('Admin ya existe, saltando seed inicial.');
    return;
  }

  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash,
      name: 'Administrador',
      phone: '0000000000',
      role: Role.admin,
      status: UserStatus.active,
    },
  });

  console.log(`Admin creado: ${admin.username} (${admin.id})`);
  console.log('Contraseña inicial: Admin1234! — cámbiala inmediatamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
