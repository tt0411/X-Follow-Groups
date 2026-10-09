import type { FollowingOp } from './following';

export type Verified = 'blue' | 'gold' | 'gray';

export interface PageInfo {
  /** URL of X's main web client bundle, which defines the GraphQL operations. */
  mainJsUrl: string | null;
  loggedIn: boolean;
}

export interface XUser {
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  verified?: Verified;
  followsYou?: boolean;
  followingCount?: number;
  followersCount?: number;
  unfollowed?: boolean;
  lastSyncAt: number;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  handles: string[];
}

export interface AppState {
  users: Record<string, XUser>;
  aliases: Record<string, string>;
  pinned: Record<string, boolean>;
  colors: Record<string, string>;
  groups: Group[];
  ungrouped: string[];
}

export type ScrapedUser = Omit<XUser, 'lastSyncAt' | 'unfollowed'>;

export interface SyncStatus {
  running: boolean;
  count: number;
  added?: number;
  message?: string;
}

/** incremental: stop once caught up with already-known follows; full: walk the whole list and detect unfollows. */
export type SyncMode = 'incremental' | 'full';
export type ScrapeEndReason = 'end' | 'caughtUp' | 'stopped' | 'rateLimited' | 'error';

export type Message =
  | { type: 'startSync'; mode: SyncMode }
  | { type: 'stopSync' }
  | { type: 'getSyncStatus' }
  | { type: 'getPageInfo' }
  | { type: 'startScrape'; mode: SyncMode; knownHandles: string[]; op: FollowingOp }
  | { type: 'stopScrape' }
  | { type: 'scrapeBatch'; users: ScrapedUser[] }
  | { type: 'scrapeDone'; reason: ScrapeEndReason; detail?: string }
  | { type: 'syncStatus'; status: SyncStatus };
