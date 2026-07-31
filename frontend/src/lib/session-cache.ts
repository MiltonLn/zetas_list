type SessionCacheReset = () => Promise<void>;

let resetSessionCache: SessionCacheReset = async () => undefined;

export function registerSessionCacheReset(reset: SessionCacheReset): void {
  resetSessionCache = reset;
}

export async function clearSessionCache(): Promise<void> {
  await resetSessionCache();
}
