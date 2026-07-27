import { Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShirtNumberTakenException } from './exceptions';

/**
 * Returns the set of genders that share a jersey-number pool with the given
 * gender. Numbers are unique per sex, and `otro` is grouped with `masculino`.
 */
export function sexGroupGenders(gender: Gender | null | undefined): Gender[] {
  return gender === Gender.femenino
    ? [Gender.femenino]
    : [Gender.masculino, Gender.otro];
}

/**
 * Throws ShirtNumberTakenException when the jersey number is already taken by
 * another user within the same sex pool.
 */
export async function assertShirtNumberAvailable(
  prisma: PrismaService,
  params: { number: number; gender: Gender | null | undefined; excludeUserId?: string },
): Promise<void> {
  const taken = await prisma.user.findFirst({
    where: {
      shirtNumber: params.number,
      gender: { in: sexGroupGenders(params.gender) },
      ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (taken) {
    throw new ShirtNumberTakenException(params.number, taken.name);
  }
}
