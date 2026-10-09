import { parseFollowingPage, type FollowingOp } from '../shared/following';
import type { Message, PageInfo, ScrapeEndReason, SyncMode } from '../shared/types';

const PAGE_SIZE = 50;
/** Pause between pages so the request rate stays close to a person scrolling quickly. */
const PAGE_DELAY_MS = 1500;
/** In incremental mode, this many already-known users in a row means we've caught up. */
const KNOWN_STREAK_TO_STOP = 20;

let running = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cookie = (name: string) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];

function pageInfo(): PageInfo {
  const src = document.querySelector<HTMLScriptElement>('script[src*="/client-web/main."]')?.src ?? null;
  return { mainJsUrl: src, loggedIn: !!cookie('twid') };
}

/** Feature flag values come from the page's inline `__INITIAL_STATE__`; unknown flags default to false. */
function resolveFlags(flagNames: string[]): Record<string, boolean> {
  const state = Array.from(document.querySelectorAll('script:not([src])'))
    .map((s) => s.textContent ?? '')
    .find((t) => t.includes('__INITIAL_STATE__')) ?? '';
  return Object.fromEntries(
    flagNames.map((n) => [n, state.match(new RegExp(`"${n}":\\{"value":(true|false)`))?.[1] === 'true']),
  );
}

/** After the extension is reloaded, scripts left in open tabs lose their context and sendMessage throws synchronously. */
const contextAlive = () => !!chrome.runtime?.id;

function send(msg: Message) {
  if (!contextAlive()) {
    running = false;
    return Promise.resolve();
  }
  try {
    return chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    running = false;
    return Promise.resolve();
  }
}

async function sync(mode: SyncMode, knownHandles: string[], op: FollowingOp): Promise<[ScrapeEndReason, string?]> {
  const userId = decodeURIComponent(cookie('twid') ?? '').replace(/^u=/, '');
  const csrf = cookie('ct0');
  if (!userId || !csrf) return ['error', '未登录 x.com'];

  const known = new Set(knownHandles);
  const features = JSON.stringify(resolveFlags(op.features));
  const fieldToggles = op.fieldToggles.length ? JSON.stringify(resolveFlags(op.fieldToggles)) : '';
  let nextCursor: string | undefined;
  let knownStreak = 0;

  while (running && contextAlive()) {
    const variables = JSON.stringify({ userId, count: PAGE_SIZE, includePromotedContent: false, cursor: nextCursor });
    const qs = new URLSearchParams({ variables, features, ...(fieldToggles && { fieldToggles }) });
    const res = await fetch(`/i/api/graphql/${op.queryId}/Following?${qs}`, {
      credentials: 'include',
      headers: {
        authorization: `Bearer ${op.bearer}`,
        'x-csrf-token': csrf,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': document.documentElement.lang || 'en',
      },
    });
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset'));
      return ['rateLimited', reset ? new Date(reset * 1000).toLocaleTimeString() : undefined];
    }
    if (!res.ok) return ['error', `接口返回 ${res.status}`];

    const json = await res.json();
    const page = parseFollowingPage(json);
    if (!page.users.length && json?.errors?.length) return ['error', json.errors[0].message];
    if (page.users.length) await send({ type: 'scrapeBatch', users: page.users });

    if (mode === 'incremental') {
      for (const u of page.users) knownStreak = known.has(u.handle.toLowerCase()) ? knownStreak + 1 : 0;
      if (knownStreak >= KNOWN_STREAK_TO_STOP) return ['caughtUp'];
    }
    if (!page.nextCursor) return ['end'];
    nextCursor = page.nextCursor;
    await sleep(PAGE_DELAY_MS);
  }
  return ['stopped'];
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'getPageInfo') sendResponse(pageInfo());
  else if (msg.type === 'startScrape') {
    if (!running) {
      running = true;
      sync(msg.mode, msg.knownHandles, msg.op)
        .catch((e): [ScrapeEndReason, string] => ['error', (e as Error).message])
        .then(([reason, detail]) => {
          running = false;
          send({ type: 'scrapeDone', reason, detail });
        });
    }
    sendResponse(true);
  } else if (msg.type === 'stopScrape') {
    running = false;
    sendResponse(true);
  }
});
