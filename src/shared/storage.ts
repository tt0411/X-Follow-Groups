import type { AppState, ScrapedUser } from './types';

const KEY = 'state';

export const emptyState = (): AppState => ({ users: {}, aliases: {}, pinned: {}, colors: {}, groups: [], ungrouped: [] });

export async function loadState(): Promise<AppState> {
  const res = await chrome.storage.local.get(KEY);
  return { ...emptyState(), ...(res[KEY] as AppState | undefined) };
}

export function saveState(state: AppState): Promise<void> {
  return chrome.storage.local.set({ [KEY]: state });
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-modify-write, serialized within the current extension context. */
export function updateState(fn: (s: AppState) => AppState): Promise<AppState> {
  const next = queue.then(async () => {
    const s = fn(await loadState());
    await saveState(s);
    return s;
  });
  queue = next.catch(() => {});
  return next;
}

export function subscribeState(cb: (s: AppState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb({ ...emptyState(), ...changes[KEY].newValue });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * New users are inserted into `ungrouped` at `cursor`, counted after the pinned users (defaults to the end).
 * The following list is newest-first, so a sync passes an advancing cursor from 0 to keep new follows on top.
 */
export function mergeScraped(state: AppState, scraped: ScrapedUser[], now = Date.now(), cursor?: number): AppState {
  const users = { ...state.users };
  const added: string[] = [];
  for (const u of scraped) {
    const key = u.handle.toLowerCase();
    const existing = users[key];
    if (!existing) added.push(key);
    users[key] = {
      handle: u.handle,
      name: u.name || existing?.name || u.handle,
      avatar: u.avatar || existing?.avatar || '',
      bio: u.bio || existing?.bio || '',
      verified: u.verified,
      followsYou: u.followsYou,
      followingCount: u.followingCount ?? existing?.followingCount,
      followersCount: u.followersCount ?? existing?.followersCount,
      lastSyncAt: now,
    };
  }
  const ungrouped = [...state.ungrouped];
  const pinnedCount = ungrouped.filter((h) => state.pinned[h]).length;
  ungrouped.splice(cursor == null ? ungrouped.length : Math.min(pinnedCount + cursor, ungrouped.length), 0, ...added);
  return { ...state, users, ungrouped };
}

/** After a complete sync, users not seen since `syncStart` are no longer followed and get dropped everywhere. */
export function removeUnfollowed(state: AppState, syncStart: number): AppState {
  const gone = new Set(Object.keys(state.users).filter((k) => state.users[k].lastSyncAt < syncStart));
  if (!gone.size) return state;
  const keep = (h: string) => !gone.has(h);
  const without = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).filter(([k]) => keep(k)));
  return {
    users: without(state.users),
    aliases: without(state.aliases),
    pinned: without(state.pinned),
    colors: without(state.colors),
    groups: state.groups.map((g) => ({ ...g, handles: g.handles.filter(keep) })),
    ungrouped: state.ungrouped.filter(keep),
  };
}
