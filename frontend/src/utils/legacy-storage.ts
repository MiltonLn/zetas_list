import type { GameList } from '../types';

const STORAGE_KEY = 'zetas-legacy-lists';

export function getLegacyLists(): GameList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameList[];
  } catch {
    return [];
  }
}

export function saveLegacyList(list: GameList): void {
  const lists = getLegacyLists();
  const idx = lists.findIndex((l) => l.id === list.id);
  if (idx >= 0) {
    lists[idx] = list;
  } else {
    lists.push(list);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function getLegacyList(id: string): GameList | undefined {
  return getLegacyLists().find((l) => l.id === id);
}

export function deleteLegacyList(id: string): void {
  const lists = getLegacyLists().filter((l) => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function legacyTitleExists(title: string): string | undefined {
  return getLegacyLists().find((l) => l.title.trim().toLowerCase() === title.trim().toLowerCase())?.id;
}
