import type { GameList } from '../types';

const STORAGE_KEY = 'zetas-lists';

export function getLists(): GameList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameList[];
  } catch {
    return [];
  }
}

export function saveList(list: GameList): void {
  const lists = getLists();
  const idx = lists.findIndex((l) => l.id === list.id);
  if (idx >= 0) {
    lists[idx] = list;
  } else {
    lists.push(list);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function getList(id: string): GameList | undefined {
  return getLists().find((l) => l.id === id);
}

export function deleteList(id: string): void {
  const lists = getLists().filter((l) => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function listTitleExists(title: string): string | undefined {
  return getLists().find((l) => l.title.trim().toLowerCase() === title.trim().toLowerCase())?.id;
}
