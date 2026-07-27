import { ModuleMetadata } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { configureApp } from '../../app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';

export const TEST_JWT_SECRET = 'test-secret-for-controller-smoke-tests';

export interface TestUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  status: string;
  phone: string;
  passwordHash?: string;
  banReason?: string | null;
  mustChangePassword?: boolean;
  position?: null;
  gender?: null;
  photoUrl?: null;
}

/**
 * Minimal PrismaService stand-in: enough for the JWT strategy to resolve a user
 * on every guarded request. Tests that need more add their own mocks.
 */
export function makePrismaMock(users: TestUser[]) {
  const byId = (id: string) => users.find((u) => u.id === id) ?? null;
  const byUsername = (username: string) => users.find((u) => u.username === username) ?? null;

  return {
    user: {
      findUnique: jest.fn(({ where }: { where: { id?: string; username?: string } }) =>
        Promise.resolve(where.id ? byId(where.id) : byUsername(where.username!)),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const user = byId(where.id);
        if (!user) return Promise.reject(new Error('not found'));
        return Promise.resolve(user);
      }),
      update: jest.fn(() => Promise.resolve(users[0])),
    },
  };
}

/**
 * Boots a real Nest HTTP app for a slice of the API (the given controllers plus
 * whatever providers the test wires up), with the same global pipes, filters and
 * `/api` prefix as `main.ts`, and the real JWT/roles guards.
 */
export async function createTestApp(metadata: ModuleMetadata): Promise<{
  app: NestExpressApplication;
  jwt: JwtService;
  tokenFor: (user: Pick<TestUser, 'id' | 'username' | 'role'>) => string;
}> {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const moduleRef = await Test.createTestingModule({
    ...metadata,
    imports: [
      PassportModule,
      JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ...(metadata.imports ?? []),
    ],
    providers: [JwtStrategy, ...(metadata.providers ?? [])],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  const jwt = moduleRef.get(JwtService);

  return {
    app,
    jwt,
    tokenFor: (user) => jwt.sign({ sub: user.id, username: user.username, role: user.role }),
  };
}

export { PrismaService };
