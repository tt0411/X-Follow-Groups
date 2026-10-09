import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { emptyState, loadState, saveState, subscribeState, updateState } from '../shared/storage';
import type { AppState, Message, SyncStatus } from '../shared/types';
import { GroupSection, UngroupedSection } from './components/GroupSection';
import type { UserActions } from './components/UserCard';
import { Icon } from './components/Icon';
import { VerifiedBadge } from './components/VerifiedBadge';
import { NO_FILTERS, isFiltering, matchesQuery, type Filters } from './search';

const UNGROUPED = 'ungrouped';
type Containers = Record<string, string[]>;

/**
 * Every known user must live in exactly one container; orphans fall back to ungrouped.
 * Pinned users are kept at the top of their container so the stored order matches what is rendered.
 */
function normalize(s: AppState): AppState {
  const placed = new Set<string>();
  const dedupe = (list: string[]) => {
    const kept = list.filter((h) => s.users[h] && !placed.has(h) && placed.add(h));
    return [...kept.filter((h) => s.pinned[h]), ...kept.filter((h) => !s.pinned[h])];
  };
  const groups = s.groups.map((g) => ({ ...g, handles: dedupe(g.handles) }));
  const ungrouped = dedupe(s.ungrouped);
  for (const h of Object.keys(s.users)) if (!placed.has(h)) ungrouped.push(h);
  return { ...s, groups, ungrouped };
}

function toContainers(s: AppState): Containers {
  const c: Containers = { [UNGROUPED]: s.ungrouped };
  for (const g of s.groups) c[g.id] = g.handles;
  return c;
}

function applyContainers(s: AppState, c: Containers): AppState {
  return normalize({
    ...s,
    groups: s.groups.map((g) => ({ ...g, handles: c[g.id] ?? g.handles })),
    ungrouped: c[UNGROUPED] ?? s.ungrouped,
  });
}

const isGroupId = (id: string) => id.startsWith('sort:');
const isUserId = (id: string) => id.startsWith('u:');

function findContainer(c: Containers, id: string): string | undefined {
  if (isGroupId(id)) return id.slice(5);
  if (id in c) return id;
  const h = id.slice(2);
  return Object.keys(c).find((k) => c[k].includes(h));
}

const collision: CollisionDetection = (args) => {
  if (isGroupId(String(args.active.id))) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((d) => isGroupId(String(d.id))),
    });
  }
  const hits = pointerWithin(args);
  const user = hits.find((h) => isUserId(String(h.id)) && h.id !== args.active.id);
  if (user) return [user];
  const container = hits.find((h) => !isUserId(String(h.id)) && !isGroupId(String(h.id)));
  if (container) return [container];
  return hits.filter((h) => isGroupId(String(h.id)));
};

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sync, setSync] = useState<SyncStatus>({ running: false, count: 0 });
  const [ungroupedOpen, setUngroupedOpen] = useState(true);
  const [draft, setDraft] = useState<Containers | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    loadState().then((s) => setState(normalize(s)));
    const unsub = subscribeState((s) => setState(normalize(s)));
    chrome.runtime.sendMessage({ type: 'getSyncStatus' } satisfies Message).then(setSync).catch(() => {});
    const onMsg = (msg: Message) => {
      if (msg.type === 'syncStatus') setSync(msg.status);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      unsub();
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, []);

  const mutate = (fn: (s: AppState) => AppState) => {
    setState((s) => normalize(fn(s)));
    updateState((s) => normalize(fn(normalize(s))));
  };

  const filterCounts = useMemo(() => {
    const users = Object.values(state.users);
    const verified = users.filter((u) => u.verified).length;
    const followsYou = users.filter((u) => u.followsYou).length;
    return {
      verified: { true: verified, false: users.length - verified },
      followsYou: { true: followsYou, false: users.length - followsYou },
    };
  }, [state.users]);

  const searching = isFiltering(query, filters);
  const containers = draft ?? toContainers(state);
  const visible = useMemo(() => {
    const out: Containers = {};
    for (const [k, list] of Object.entries(containers)) out[k] = list.filter((h) => matchesQuery(state, h, query, filters));
    return out;
  }, [containers, state, query, filters]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    if (isUserId(String(active.id))) setDraft(toContainers(state));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!draft || !over || !isUserId(String(active.id))) return;
    const from = findContainer(draft, String(active.id));
    const to = findContainer(draft, String(over.id));
    if (!from || !to || from === to) return;
    const handle = String(active.id).slice(2);
    const target = [...draft[to]];
    let idx = target.length;
    if (isUserId(String(over.id))) {
      idx = target.indexOf(String(over.id).slice(2));
      const rect = active.rect.current.translated;
      if (rect && rect.top > over.rect.top + over.rect.height / 2) idx++;
    }
    target.splice(idx, 0, handle);
    setDraft({ ...draft, [from]: draft[from].filter((h) => h !== handle), [to]: target });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const aid = String(active.id);
    setActiveId(null);
    if (isGroupId(aid)) {
      if (over && isGroupId(String(over.id)) && over.id !== aid) {
        mutate((s) => {
          const from = s.groups.findIndex((g) => g.id === aid.slice(5));
          const to = s.groups.findIndex((g) => g.id === String(over.id).slice(5));
          return from < 0 || to < 0 ? s : { ...s, groups: arrayMove(s.groups, from, to) };
        });
      }
      return;
    }
    if (!draft) return;
    let next = draft;
    if (over && isUserId(String(over.id))) {
      const c = findContainer(draft, aid);
      if (c && c === findContainer(draft, String(over.id))) {
        const list = draft[c];
        next = { ...draft, [c]: arrayMove(list, list.indexOf(aid.slice(2)), list.indexOf(String(over.id).slice(2))) };
      }
    }
    setDraft(null);
    mutate((s) => applyContainers(s, next));
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDraft(null);
  };

  const setEntry = (key: 'aliases' | 'colors', handle: string, value: string) =>
    mutate((s) => {
      const map: Record<string, string> = { ...s[key] };
      if (value) map[handle] = value;
      else delete map[handle];
      return { ...s, [key]: map };
    });

  const togglePin = (handle: string) =>
    mutate((s) => {
      const pinned = { ...s.pinned };
      if (pinned[handle]) {
        delete pinned[handle];
        return { ...s, pinned };
      }
      pinned[handle] = true;
      const toFront = (list: string[]) => (list.includes(handle) ? [handle, ...list.filter((h) => h !== handle)] : list);
      return {
        ...s,
        pinned,
        groups: s.groups.map((g) => ({ ...g, handles: toFront(g.handles) })),
        ungrouped: toFront(s.ungrouped),
      };
    });

  const moveTo = (handle: string, target: string) =>
    mutate((s) => {
      const place = (id: string, list: string[]) => {
        const rest = list.filter((h) => h !== handle);
        return id === target ? [handle, ...rest] : rest;
      };
      return {
        ...s,
        groups: s.groups.map((g) => ({ ...g, handles: place(g.id, g.handles) })),
        ungrouped: place(UNGROUPED, s.ungrouped),
      };
    });

  const userActions: UserActions = {
    setAlias: (h, v) => setEntry('aliases', h, v),
    setColor: (h, v) => setEntry('colors', h, v),
    togglePin,
    moveTo,
  };

  const addGroup = () => {
    // Empty groups are hidden while searching, so the new group would otherwise be invisible.
    setQuery('');
    setFilters(NO_FILTERS);
    mutate((s) => ({
      ...s,
      groups: [
        { id: `g_${Date.now().toString(36)}`, name: `新分组 ${s.groups.length + 1}`, collapsed: false, handles: [] },
        ...s.groups,
      ],
    }));
  };

  const updateGroup = (id: string, patch: Partial<AppState['groups'][number]>) =>
    mutate((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));

  const deleteGroup = (id: string, name: string) => {
    if (!confirm(`删除分组「${name}」？组内成员会回到未分组。`)) return;
    mutate((s) => {
      const g = s.groups.find((x) => x.id === id);
      return { ...s, groups: s.groups.filter((x) => x.id !== id), ungrouped: [...s.ungrouped, ...(g?.handles ?? [])] };
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `x-follow-groups-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as AppState;
      if (typeof data.users !== 'object' || !Array.isArray(data.groups)) throw new Error('格式不正确');
      if (!confirm('导入会覆盖当前所有数据，确定吗？')) return;
      const next = normalize({ ...emptyState(), ...data });
      setState(next);
      await saveState(next);
    } catch (e) {
      alert(`导入失败：${(e as Error).message}`);
    }
  };

  const total = Object.keys(state.users).length;
  const countLabel = (k: string) => (searching ? visible[k].length : containers[k].length);
  const activeUser = activeId && isUserId(activeId) ? activeId.slice(2) : null;
  const activeGroup = activeId && isGroupId(activeId) ? state.groups.find((g) => g.id === activeId.slice(5)) : null;

  return (
    <div className="app">
      <header className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={`搜索 ${total} 位关注（别名 / 昵称 / @handle / 简介）`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filters">
          {(
            [
              ['verified', '认证用户', '非认证用户'],
              ['followsYou', '关注了我', '未关注我'],
            ] as const
          ).map(([key, yes, no]) => (
            <div key={key} className="filter-pair">
              {([[true, yes], [false, no]] as const).map(([value, label]) => (
                <button
                  key={label}
                  className={`chip${filters[key] === value ? ' on' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }))}
                >
                  {label}
                  <span className="chip-count">{filterCounts[key][`${value}`]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="actions">
          {sync.running ? (
            <button className="danger" onClick={() => chrome.runtime.sendMessage({ type: 'stopSync' } satisfies Message)}>
              停止同步（{sync.count}）
            </button>
          ) : (
            <button
              className="primary"
              title="从最新关注开始同步，追上已同步过的人就停止"
              onClick={() => chrome.runtime.sendMessage({ type: 'startSync', mode: 'incremental' } satisfies Message)}
            >
              同步新关注
            </button>
          )}
          <button onClick={addGroup}>+ 分组</button>
          <div className="menu-wrap" ref={menuRef}>
            <button className="icon-btn round more" title="更多" onClick={() => setMenuOpen((v) => !v)}>
              <Icon name="more" size={20} />
            </button>
            {menuOpen && (
              <div className="menu" onClick={() => setMenuOpen(false)}>
                <button
                  disabled={sync.running}
                  onClick={() => chrome.runtime.sendMessage({ type: 'startSync', mode: 'full' } satisfies Message)}
                >
                  全量同步
                  <small>刷新所有人资料，标记已取关</small>
                </button>
                <hr />
                <button onClick={exportJson}>导出数据</button>
                <button onClick={() => fileRef.current?.click()}>导入数据</button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        {sync.message && <div className="status">{sync.message}</div>}
      </header>

      {total === 0 ? (
        <div className="empty-state">还没有数据。打开 x.com 并登录后点击「同步新关注」。</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <main className="groups">
            <SortableContext items={state.groups.map((g) => `sort:${g.id}`)} strategy={verticalListSortingStrategy}>
              {state.groups.map((g) =>
                searching && visible[g.id].length === 0 ? null : (
                  <GroupSection
                    key={g.id}
                    id={g.id}
                    name={g.name}
                    total={countLabel(g.id)}
                    handles={visible[g.id]}
                    expanded={searching || !g.collapsed}
                    state={state}
                    dragDisabled={searching}
                    actions={userActions}
                    onToggle={() => updateGroup(g.id, { collapsed: !g.collapsed })}
                    onRename={(name) => updateGroup(g.id, { name })}
                    onDelete={() => deleteGroup(g.id, g.name)}
                  />
                ),
              )}
            </SortableContext>
            {!(searching && visible[UNGROUPED].length === 0) && (
              <UngroupedSection
                name="未分组"
                total={countLabel(UNGROUPED)}
                handles={visible[UNGROUPED]}
                expanded={searching || ungroupedOpen}
                state={state}
                dragDisabled={searching}
                actions={userActions}
                onToggle={() => setUngroupedOpen((v) => !v)}
              />
            )}
            {searching && Object.values(visible).every((l) => l.length === 0) && (
              <div className="empty-state">没有符合条件的用户</div>
            )}
          </main>
          <DragOverlay>
            {activeUser ? (
              <div className="user-card overlay" style={{ background: state.colors[activeUser] }}>
                {state.users[activeUser]?.avatar && <img className="avatar" src={state.users[activeUser].avatar} alt="" />}
                <div className="user-info">
                  <div className="user-name">
                    <span className="name-text">{state.users[activeUser]?.name || activeUser}</span>
                    {state.users[activeUser]?.verified && <VerifiedBadge type={state.users[activeUser].verified!} />}
                  </div>
                  {state.aliases[activeUser] && <div className="alias">{state.aliases[activeUser]}</div>}
                  <div className="user-sub">@{state.users[activeUser]?.handle ?? activeUser}</div>
                </div>
              </div>
            ) : activeGroup ? (
              <div className="group overlay">
                <div className="group-header">
                  <span className="group-name">{activeGroup.name}</span>
                  <span className="count">{activeGroup.handles.length}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
