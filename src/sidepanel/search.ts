import type { AppState } from '../shared/types';

/** `null` means "don't filter on this"; `true`/`false` keeps only users with/without the trait. */
export interface Filters {
  verified: boolean | null;
  followsYou: boolean | null;
}

export const NO_FILTERS: Filters = { verified: null, followsYou: null };

export const isFiltering = (query: string, f: Filters) => query.trim() !== '' || f.verified !== null || f.followsYou !== null;

export function matchesQuery(state: AppState, handle: string, query: string, filters: Filters): boolean {
  const u = state.users[handle];
  if (filters.verified !== null && !!u?.verified !== filters.verified) return false;
  if (filters.followsYou !== null && !!u?.followsYou !== filters.followsYou) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [state.aliases[handle], u?.name, u?.handle ?? handle, u?.bio].some((f) => f?.toLowerCase().includes(q));
}
