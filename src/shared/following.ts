import type { ScrapedUser, Verified } from './types';

/** Parameters of X's internal GraphQL `Following` operation, extracted from the web client bundle. */
export interface FollowingOp {
  queryId: string;
  features: string[];
  fieldToggles: string[];
  bearer: string;
}

/** The public bearer token embedded in X's web client; used when the bundle can't be parsed for one. */
export const FALLBACK_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const names = (list: string | undefined) => Array.from((list ?? '').matchAll(/"([^"]+)"/g), (m) => m[1]);

export function parseBundle(js: string): FollowingOp | null {
  const m = js.match(/queryId:"([\w-]+)",operationName:"Following",([\s\S]{0,6000}?)\}\}/);
  if (!m) return null;
  return {
    queryId: m[1],
    features: names(m[2].match(/featureSwitches:\[([^\]]*)\]/)?.[1]),
    fieldToggles: names(m[2].match(/fieldToggles:\[([^\]]*)\]/)?.[1]),
    bearer: js.match(/"(AAAAAAAAAAAAAAAAAAAAA[\w%]+)"/)?.[1] ?? FALLBACK_BEARER,
  };
}

type Json = any;

function findInstructions(node: Json): Json[] | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node.instructions)) return node.instructions;
  for (const v of Object.values(node)) {
    const found = findInstructions(v);
    if (found) return found;
  }
  return undefined;
}

function expandBio(legacy: Json, text: string): string {
  for (const u of legacy?.entities?.description?.urls ?? []) {
    if (u.url && u.expanded_url) text = text.split(u.url).join(u.expanded_url);
  }
  return text;
}

/** Handles both the older `legacy.*` user shape and the newer `core` / `avatar` split. */
export function parseUser(r: Json): ScrapedUser | null {
  if (!r || r.__typename !== 'User') return null;
  const legacy = r.legacy ?? {};
  const handle: string | undefined = r.core?.screen_name ?? legacy.screen_name;
  if (!handle) return null;
  const verifiedType: string | undefined = r.verification?.verified_type ?? legacy.verified_type;
  let verified: Verified | undefined;
  if (verifiedType === 'Business') verified = 'gold';
  else if (verifiedType === 'Government') verified = 'gray';
  else if (r.is_blue_verified || r.verification?.verified || legacy.verified) verified = 'blue';
  const bio: string = r.profile_bio?.description ?? legacy.description ?? '';
  return {
    handle,
    name: r.core?.name ?? legacy.name ?? handle,
    avatar: r.avatar?.image_url ?? legacy.profile_image_url_https ?? '',
    bio: expandBio(legacy, bio),
    verified,
    followsYou: !!(r.relationship_perspectives?.followed_by ?? legacy.followed_by),
    followingCount: legacy.friends_count,
    followersCount: legacy.followers_count,
  };
}

export function parseFollowingPage(json: Json): { users: ScrapedUser[]; nextCursor?: string } {
  const users: ScrapedUser[] = [];
  let nextCursor: string | undefined;
  for (const ins of findInstructions(json?.data) ?? []) {
    for (const entry of ins.entries ?? []) {
      const id: string = entry.entryId ?? '';
      if (id.startsWith('user-')) {
        const u = parseUser(entry.content?.itemContent?.user_results?.result);
        if (u) users.push(u);
      } else if (id.startsWith('cursor-bottom-')) {
        nextCursor = entry.content?.value;
      }
    }
  }
  // X returns a "0|..." bottom cursor once the list is exhausted.
  if (!users.length || nextCursor?.startsWith('0|')) nextCursor = undefined;
  return { users, nextCursor };
}
