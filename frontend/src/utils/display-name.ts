/** Returns the alias if set, otherwise the real name. Use this for all in-app list display. */
export function displayName(user: { name: string; alias?: string | null }): string {
  return user.alias?.trim() || user.name;
}
