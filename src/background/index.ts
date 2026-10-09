import { parseBundle, type FollowingOp } from '../shared/following';
import { loadState, markUnfollowed, mergeScraped, updateState } from '../shared/storage';
import type { Message, PageInfo, SyncMode, SyncStatus } from '../shared/types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

let status: SyncStatus = { running: false, count: 0 };
let syncStart = 0;
let syncTabId: number | null = null;
let syncMode: SyncMode = 'incremental';
/** Insert position (after pinned) for the next newly-found user in `ungrouped`. */
let cursor = 0;

function setStatus(next: Partial<SyncStatus>) {
  status = { ...status, ...next };
  chrome.runtime.sendMessage({ type: 'syncStatus', status } satisfies Message).catch(() => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const check = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(check);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    });
  });
}

/** Any x.com tab works since requests only need the logged-in session; open one in the background if none. */
async function findXTab(): Promise<chrome.tabs.Tab> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.url?.startsWith('https://x.com/')) return active;
  const [any] = await chrome.tabs.query({ url: 'https://x.com/*' });
  return any ?? chrome.tabs.create({ url: 'https://x.com/home', active: false });
}

async function getPageInfo(tabId: number): Promise<PageInfo> {
  let reloaded = false;
  for (let i = 0; i < 20; i++) {
    try {
      const info: PageInfo = await chrome.tabs.sendMessage(tabId, { type: 'getPageInfo' } satisfies Message);
      if (info.mainJsUrl) return info;
    } catch {
      // Tabs opened before the extension was installed have no content script yet.
      if (!reloaded) {
        reloaded = true;
        await chrome.tabs.reload(tabId);
        await waitForLoad(tabId);
      }
    }
    await sleep(500);
  }
  throw new Error('x.com 页面没有加载完成，请刷新后重试');
}

const OP_CACHE_KEY = 'followingOp';

/** The queryId rotates with each X deploy, so it's re-parsed whenever the bundle URL changes. */
async function getFollowingOp(mainJsUrl: string): Promise<FollowingOp> {
  const cached = (await chrome.storage.local.get(OP_CACHE_KEY))[OP_CACHE_KEY];
  if (cached?.mainJsUrl === mainJsUrl) return cached.op;
  const js = await (await fetch(mainJsUrl)).text();
  const op = parseBundle(js);
  if (!op) throw new Error('无法从 X 前端代码中解析关注接口，可能 X 已改版');
  await chrome.storage.local.set({ [OP_CACHE_KEY]: { mainJsUrl, op } });
  return op;
}

async function startSync(mode: SyncMode) {
  if (status.running) return;
  syncMode = mode;
  cursor = 0;
  setStatus({ running: true, count: 0, added: 0, message: '正在准备…' });
  try {
    const tab = await findXTab();
    const tabId = tab.id!;
    syncTabId = tabId;
    await waitForLoad(tabId);
    const info = await getPageInfo(tabId);
    if (!info.loggedIn) throw new Error('请先登录 x.com');
    const op = await getFollowingOp(info.mainJsUrl!);
    syncStart = Date.now();
    setStatus({ message: mode === 'full' ? '正在全量同步…' : '正在查找新关注…' });
    const knownHandles = Object.keys((await loadState()).users);
    await chrome.tabs.sendMessage(tabId, { type: 'startScrape', mode, knownHandles, op } satisfies Message);
  } catch (e) {
    setStatus({ running: false, message: `同步失败：${(e as Error).message}` });
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case 'startSync':
      startSync(msg.mode);
      break;
    case 'stopSync':
      if (syncTabId != null) chrome.tabs.sendMessage(syncTabId, { type: 'stopScrape' } satisfies Message).catch(() => {});
      break;
    case 'scrapeBatch': {
      let added = 0;
      updateState((s) => {
        const next = mergeScraped(s, msg.users, Date.now(), cursor);
        added = next.ungrouped.length - s.ungrouped.length;
        return next;
      }).then(() => {
        cursor += added;
        const total = status.count + msg.users.length;
        const totalAdded = (status.added ?? 0) + added;
        setStatus({ count: total, added: totalAdded, message: `已扫描 ${total} 人，新增 ${totalAdded} 人` });
      });
      break;
    }
    case 'scrapeDone': {
      const fullyWalked = syncMode === 'full' && msg.reason === 'end';
      const summary = `扫描 ${status.count} 人，新增 ${status.added ?? 0} 人`;
      const messages: Record<typeof msg.reason, string> = {
        stopped: `已停止：${summary}`,
        caughtUp: `已是最新：${summary}`,
        end: `${syncMode === 'full' ? '全量同步完成' : '已同步到列表末尾'}：${summary}`,
        rateLimited: `被 X 限流，已停止（${summary}）。${msg.detail ? `请在 ${msg.detail} 之后` : '请稍后'}再试`,
        error: `同步出错：${msg.detail ?? '未知错误'}（${summary}）`,
      };
      // A stale queryId usually surfaces as a 4xx; drop the cache so the next sync re-parses the bundle.
      if (msg.reason === 'error') chrome.storage.local.remove(OP_CACHE_KEY);
      updateState((s) => (fullyWalked ? markUnfollowed(s, syncStart) : s)).then(() =>
        setStatus({ running: false, message: messages[msg.reason] }),
      );
      break;
    }
    case 'getSyncStatus':
      break;
    default:
      return;
  }
  sendResponse(status);
});
