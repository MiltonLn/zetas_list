import { PrismaClient } from '@prisma/client';
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, proto, BufferJSON } from '@whiskeysockets/baileys';

/**
 * Stores Baileys auth credentials in PostgreSQL via Prisma.
 * Survives container restarts and re-deploys.
 */
export async function usePrismaAuthState(prisma: PrismaClient): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const writeData = async (key: string, data: unknown) => {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await prisma.whatsappSession.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  };

  const readData = async (key: string): Promise<unknown | null> => {
    const row = await prisma.whatsappSession.findUnique({ where: { key } });
    if (!row) return null;
    return JSON.parse(row.value, BufferJSON.reviver);
  };

  const removeData = async (key: string) => {
    await prisma.whatsappSession.deleteMany({ where: { key } });
  };

  const creds: AuthenticationCreds =
    (await readData('creds') as AuthenticationCreds | null) || initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const data: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await readData(`${type}-${id}`);
            if (value) {
              if (type === 'app-state-sync-key') {
                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T];
              } else {
                data[id] = value as SignalDataTypeMap[T];
              }
            }
          }),
        );
        return data;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        const tasks: Promise<void>[] = [];
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const key = `${category}-${id}`;
            tasks.push(value ? writeData(key, value) : removeData(key));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  return {
    state,
    saveCreds: () => writeData('creds', state.creds),
  };
}
