/**
 * In-memory Prisma double for stateful scenario tests.
 *
 * This is NOT a full Prisma implementation — it only supports the subset of
 * operations that `GamesService` (and the scenario tests) exercise, but it
 * keeps real state across calls so you can simulate end-to-end flows:
 * inscribir gente, pasar el cutoff, subir/bajar de la lista de espera, etc.
 *
 * Intentionally lives outside `*.spec.ts` so Jest does not run it as a suite.
 */

import { GameStatus, Modalidad, Role, UserStatus } from '@prisma/client';

type AnyRecord = Record<string, unknown>;

interface WhereCond {
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  not?: unknown;
  contains?: string;
  mode?: string;
}

type OrderBy = Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Deep clone that preserves Date instances (used for transaction snapshots). */
function deepClone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: AnyRecord = {};
    for (const k of Object.keys(value as AnyRecord)) out[k] = deepClone((value as AnyRecord)[k]);
    return out as unknown as T;
  }
  return value;
}

function isOperatorObject(cond: unknown): cond is WhereCond {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) return false;
  const keys = Object.keys(cond as AnyRecord);
  return keys.some((k) => ['gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'not', 'contains', 'mode'].includes(k));
}

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if ((av as number) < (bv as number)) return -1;
  if ((av as number) > (bv as number)) return 1;
  return 0;
}

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function matchCond(actual: unknown, cond: WhereCond): boolean {
  if ('gt' in cond && !(cmp(actual, cond.gt) > 0)) return false;
  if ('gte' in cond && !(cmp(actual, cond.gte) >= 0)) return false;
  if ('lt' in cond && !(cmp(actual, cond.lt) < 0)) return false;
  if ('lte' in cond && !(cmp(actual, cond.lte) <= 0)) return false;
  if ('in' in cond && !(cond.in ?? []).some((v) => eq(actual, v))) return false;
  if ('notIn' in cond && (cond.notIn ?? []).some((v) => eq(actual, v))) return false;
  if ('not' in cond) {
    if (cond.not === null) {
      if (actual === null || actual === undefined) return false;
    } else if (eq(actual, cond.not)) {
      return false;
    }
  }
  if ('contains' in cond && typeof actual === 'string' && typeof cond.contains === 'string') {
    const hay = cond.mode === 'insensitive' ? actual.toLowerCase() : actual;
    const needle = cond.mode === 'insensitive' ? cond.contains.toLowerCase() : cond.contains;
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function matchWhere(row: AnyRecord, where?: AnyRecord): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((w) => matchWhere(row, w as AnyRecord))) return false;
      continue;
    }
    if (key === 'OR') {
      const list = (cond as AnyRecord[]) ?? [];
      if (!list.some((w) => matchWhere(row, w))) return false;
      continue;
    }
    const actual = row[key];
    if (isOperatorObject(cond)) {
      if (!matchCond(actual, cond)) return false;
    } else if (!eq(actual, cond)) {
      return false;
    }
  }
  return true;
}

function applyData(row: AnyRecord, data: AnyRecord): void {
  for (const [key, val] of Object.entries(data)) {
    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      const op = val as AnyRecord;
      if ('increment' in op) {
        row[key] = ((row[key] as number) ?? 0) + (op.increment as number);
        continue;
      }
      if ('decrement' in op) {
        row[key] = ((row[key] as number) ?? 0) - (op.decrement as number);
        continue;
      }
      if ('set' in op) {
        row[key] = op.set;
        continue;
      }
    }
    row[key] = val;
  }
}

function sortRows(rows: AnyRecord[], orderBy?: OrderBy): AnyRecord[] {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, dir] = Object.entries(spec)[0];
      const diff = cmp(a[field], b[field]);
      if (diff !== 0) return dir === 'desc' ? -diff : diff;
    }
    return 0;
  });
}

export interface SeedUser {
  id?: string;
  name: string;
  username: string;
  phone?: string;
  role?: Role;
  status?: UserStatus;
}

export class InMemoryPrisma {
  private games: AnyRecord[] = [];
  private regs: AnyRecord[] = [];
  private users: AnyRecord[] = [];
  private txDepth = 0;

  // ── Seeding helpers ───────────────────────────────────────────────────────

  seedUser(user: SeedUser): AnyRecord {
    const row: AnyRecord = {
      id: user.id ?? nextId('user'),
      name: user.name,
      username: user.username,
      phone: user.phone ?? `300${Math.floor(Math.random() * 10000000)}`,
      role: user.role ?? Role.member,
      status: user.status ?? UserStatus.active,
      position: null,
      gender: null,
      heightCm: null,
      birthDate: null,
      photoUrl: null,
      bio: null,
    };
    this.users.push(row);
    return row;
  }

  /** Direct accessors for assertions in tests. */
  getRegistrations(gameId: string): AnyRecord[] {
    return sortRows(
      this.regs.filter((r) => r.gameId === gameId),
      [{ isWaitingList: 'asc' }, { position: 'asc' }],
    ).map((r) => this.withRelations(r, { user: true, registeredBy: true }));
  }

  getGame(gameId: string): AnyRecord | undefined {
    return this.games.find((g) => g.id === gameId);
  }

  // ── Relation resolution ───────────────────────────────────────────────────

  private withRelations(row: AnyRecord, include?: AnyRecord): AnyRecord {
    const clone: AnyRecord = { ...row };
    if (include?.user) {
      clone.user = row.userId ? { ...this.users.find((u) => u.id === row.userId) } : null;
    }
    if (include?.registeredBy) {
      clone.registeredBy = row.registeredById
        ? { ...this.users.find((u) => u.id === row.registeredById) }
        : null;
    }
    return clone;
  }

  private gameWithRelations(row: AnyRecord, include?: AnyRecord): AnyRecord {
    const clone: AnyRecord = { ...row };
    if (include?.createdBy) {
      clone.createdBy = row.createdById ? { ...this.users.find((u) => u.id === row.createdById) } : null;
    }
    if (include?.registrations) {
      const sub = include.registrations as AnyRecord;
      let list = this.regs.filter((r) => r.gameId === row.id);
      list = sortRows(list, sub.orderBy as OrderBy);
      clone.registrations = list.map((r) => this.withRelations(r, sub.include as AnyRecord));
    }
    if (include?._count) {
      clone._count = { registrations: this.regs.filter((r) => r.gameId === row.id).length };
    }
    return clone;
  }

  // ── prisma.game ───────────────────────────────────────────────────────────

  game = {
    findFirst: async (args?: AnyRecord) => {
      const where = args?.where as AnyRecord | undefined;
      const found = sortRows(this.games.filter((g) => matchWhere(g, where)), args?.orderBy as OrderBy)[0];
      return found ? this.gameWithRelations(found, args?.include as AnyRecord) : null;
    },
    findUnique: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const found = this.games.find((g) => g.id === where.id);
      if (!found) return null;
      if (args.select) return this.selectFields(found, args.select as AnyRecord);
      return this.gameWithRelations(found, args.include as AnyRecord);
    },
    findUniqueOrThrow: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const found = this.games.find((g) => g.id === where.id);
      if (!found) throw new Error('Game not found');
      return this.gameWithRelations(found, args.include as AnyRecord);
    },
    findMany: async (args?: AnyRecord) => {
      const where = args?.where as AnyRecord | undefined;
      let list = this.games.filter((g) => matchWhere(g, where));
      list = sortRows(list, args?.orderBy as OrderBy);
      if (typeof args?.skip === 'number') list = list.slice(args.skip as number);
      if (typeof args?.take === 'number') list = list.slice(0, args.take as number);
      return list.map((g) => this.gameWithRelations(g, args?.include as AnyRecord));
    },
    count: async (args?: AnyRecord) => this.games.filter((g) => matchWhere(g, args?.where as AnyRecord)).length,
    create: async (args: AnyRecord) => {
      const data = args.data as AnyRecord;
      const row: AnyRecord = {
        id: data.id ?? nextId('game'),
        mainListHasBeenFull: false,
        cutoffNotified: false,
        cancellationReason: null,
        completionReport: null,
        maxProxyRegistrations: 1,
        fineAmountNoShow: 5000,
        vigilante: 10000,
        pricePerPlayer: 2000,
        guestCutoffTime: '13:30',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.games.push(row);
      return this.gameWithRelations(row, args.include as AnyRecord);
    },
    update: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const found = this.games.find((g) => g.id === where.id);
      if (!found) throw new Error('Game not found');
      applyData(found, args.data as AnyRecord);
      return this.gameWithRelations(found, args.include as AnyRecord);
    },
  };

  // ── prisma.gameRegistration ────────────────────────────────────────────────

  gameRegistration = {
    findFirst: async (args?: AnyRecord) => {
      const where = args?.where as AnyRecord | undefined;
      const list = sortRows(this.regs.filter((r) => matchWhere(r, where)), args?.orderBy as OrderBy);
      const found = list[0];
      return found ? this.withRelations(found, args?.include as AnyRecord) : null;
    },
    findUnique: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      let found: AnyRecord | undefined;
      if (where.id) found = this.regs.find((r) => r.id === where.id);
      else if (where.gameId_userId) {
        const key = where.gameId_userId as AnyRecord;
        found = this.regs.find((r) => r.gameId === key.gameId && r.userId === key.userId);
      }
      if (!found) return null;
      if (args.select) return this.selectFields(found, args.select as AnyRecord);
      return this.withRelations(found, args.include as AnyRecord);
    },
    findMany: async (args?: AnyRecord) => {
      const where = args?.where as AnyRecord | undefined;
      let list = this.regs.filter((r) => matchWhere(r, where));
      list = sortRows(list, args?.orderBy as OrderBy);
      if (typeof args?.skip === 'number') list = list.slice(args.skip as number);
      if (typeof args?.take === 'number') list = list.slice(0, args.take as number);
      if (args?.select) return list.map((r) => this.selectFields(r, args.select as AnyRecord));
      return list.map((r) => this.withRelations(r, args?.include as AnyRecord));
    },
    count: async (args?: AnyRecord) => this.regs.filter((r) => matchWhere(r, args?.where as AnyRecord)).length,
    aggregate: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const matched = this.regs.filter((r) => matchWhere(r, where));
      const positions = matched.map((r) => r.position as number);
      return { _max: { position: positions.length ? Math.max(...positions) : null } };
    },
    create: async (args: AnyRecord) => {
      const data = args.data as AnyRecord;
      const row: AnyRecord = {
        id: data.id ?? nextId('reg'),
        userId: null,
        isWaitingList: false,
        attended: false,
        paid: false,
        fromWaitList: false,
        isGuest: false,
        guestName: null,
        pendingConfirmation: false,
        confirmationDeadline: null,
        confirmationDeclined: false,
        originalWaitPosition: null,
        fineExempt: false,
        note: null,
        registeredAt: new Date(),
        ...data,
      };
      this.regs.push(row);
      return this.withRelations(row, args.include as AnyRecord);
    },
    update: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const found = this.regs.find(
        (r) => r.id === where.id && (where.gameId === undefined || r.gameId === where.gameId),
      );
      if (!found) throw new Error(`Registration not found: ${String(where.id)}`);
      applyData(found, args.data as AnyRecord);
      return this.withRelations(found, args.include as AnyRecord);
    },
    updateMany: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const matched = this.regs.filter((r) => matchWhere(r, where));
      matched.forEach((r) => applyData(r, args.data as AnyRecord));
      return { count: matched.length };
    },
    delete: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const idx = this.regs.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('Registration not found');
      const [removed] = this.regs.splice(idx, 1);
      return removed;
    },
    deleteMany: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const before = this.regs.length;
      this.regs = this.regs.filter((r) => !matchWhere(r, where));
      return { count: before - this.regs.length };
    },
  };

  // ── prisma.user ─────────────────────────────────────────────────────────────

  user = {
    findUnique: async (args: AnyRecord) => {
      const where = args.where as AnyRecord;
      const found = this.users.find((u) => u.id === where.id || u.username === where.username);
      if (!found) return null;
      if (args.select) return this.selectFields(found, args.select as AnyRecord);
      return { ...found };
    },
    findMany: async (args?: AnyRecord) => {
      const where = args?.where as AnyRecord | undefined;
      let list = this.users.filter((u) => matchWhere(u, where));
      list = sortRows(list, args?.orderBy as OrderBy);
      if (args?.select) return list.map((u) => this.selectFields(u, args.select as AnyRecord));
      return list.map((u) => ({ ...u }));
    },
  };

  private selectFields(row: AnyRecord, select: AnyRecord): AnyRecord {
    const out: AnyRecord = {};
    for (const key of Object.keys(select)) {
      if (select[key]) out[key] = row[key];
    }
    return out;
  }

  // ── prisma.$transaction / $queryRaw ─────────────────────────────────────────

  // The FOR UPDATE lock query only needs to return the locked game row(s).
  $queryRaw = async (_strings: TemplateStringsArray, ...values: unknown[]): Promise<AnyRecord[]> => {
    const gameId = values[0] as string;
    const game = this.games.find((g) => g.id === gameId);
    return game ? [{ ...game }] : [];
  };

  // Runs the callback with `this` as the tx context. Rollback semantics: at the
  // outermost transaction we snapshot the store; if the callback throws, we
  // restore it so error-path scenarios don't leave partial writes (mimicking a
  // real Postgres rollback). Nested calls reuse the outer snapshot.
  $transaction = async <T>(
    arg: ((tx: InMemoryPrisma) => Promise<T>) | Array<Promise<unknown>>,
  ): Promise<T | unknown[]> => {
    if (typeof arg !== 'function') return Promise.all(arg);

    const snapshot =
      this.txDepth === 0
        ? { games: deepClone(this.games), regs: deepClone(this.regs), users: deepClone(this.users) }
        : null;
    this.txDepth += 1;
    try {
      return await arg(this);
    } catch (e) {
      if (snapshot) {
        this.games = snapshot.games;
        this.regs = snapshot.regs;
        this.users = snapshot.users;
      }
      throw e;
    } finally {
      this.txDepth -= 1;
    }
  };
}

/** Convenience: build a registration-open game row directly in the store. */
export function makeGameData(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    title: 'Volley Test',
    modalidad: Modalidad.seis_x_seis,
    gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    startTime: '18:50',
    registrationOpenAt: new Date(Date.now() - 60 * 60 * 1000),
    maxMainSpots: 4,
    pricePerPlayer: 2000,
    vigilante: 10000,
    status: GameStatus.registration_open,
    guestCutoffTime: '13:30',
    maxProxyRegistrations: 5,
    fineAmountNoShow: 5000,
    mainListHasBeenFull: false,
    cutoffNotified: false,
    createdById: 'admin-1',
    ...overrides,
  };
}
